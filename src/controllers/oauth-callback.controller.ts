
import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.config";
import { validateProvider } from "../validators/oauth.validator";
import { exchangeCode, getProviderProfile } from "../services/oauth-callback.service";
import { resolveOAuthIdentity } from "../services/oauth-decision.service";
import * as SessionService from "../services/session.service";
import { isActiveProfileUser } from "../repositories/profile-read.repository";
import { ConflictError } from "../helpers/errors.helper";
import { OAuthCallbackError } from "../types/oauth-callback.types";
import type { OAuthFlow } from "../types/oauth.types";
import { buildOAuthReturnUrl } from "../services/oauth.service";

interface StoredOAuthFlow extends OAuthFlow {
  intent: "login" | "link";
  userId: string | null;
  issuedAt: number;
  returnTo?: string;
}

function redirectResult(res: Response, status: string, flow?: StoredOAuthFlow, stage = "state"): void {
  if (status !== "success") {
    console.warn("OAuth callback rejected", { provider: flow?.provider, stage, result: status });
  }
  res.redirect(302, buildOAuthReturnUrl(status, flow));
}

function validState(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readFlow(value: unknown): StoredOAuthFlow | null {
  if (typeof value !== "string") return null;

  try {
    const flow: unknown = JSON.parse(value);
    if (!flow || typeof flow !== "object") return null;
    const data = flow as Record<string, unknown>;

    if (data.provider !== "google" && data.provider !== "github") return null;
    if (typeof data.state !== "string" || !data.state) return null;
    if (typeof data.codeVerifier !== "string" || !data.codeVerifier) return null;
    if (data.intent !== "login" && data.intent !== "link") return null;
    if (!Object.prototype.hasOwnProperty.call(data, "userId")) return null;
    if (data.intent === "login" && data.userId !== null) return null;
    if (data.intent === "link" && (typeof data.userId !== "string" || !data.userId)) return null;
    if (typeof data.issuedAt !== "number" || !Number.isFinite(data.issuedAt)) return null;

    return data as unknown as StoredOAuthFlow;
  } catch {
    return null;
  }
}

export async function oauthCallback(req: Request, res: Response): Promise<void> {
  res.set("Cache-Control", "no-store");
  const flow = readFlow(req.signedCookies?.oauth_flow);

  res.clearCookie("oauth_flow", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/auth",
  });
  res.clearCookie("oauth_flow", {
    httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/api",
  });

  let provider: "google" | "github";

  try {
    provider = validateProvider(req.params.provider);
  } catch {
    redirectResult(res, "invalid_provider");
    return;
  }

  if (req.query.error === "access_denied") {
    redirectResult(res, "access_denied", flow?.provider === provider ? flow : undefined);
    return;
  }

  if (!flow || flow.provider !== provider || Date.now() - flow.issuedAt > 300000 || flow.issuedAt > Date.now()) {
    redirectResult(res, "invalid_state");
    return;
  }

  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!state || !validState(state, flow.state)) {
    redirectResult(res, "invalid_state");
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) {
    redirectResult(res, "invalid_code");
    return;
  }

  let stage = "session";
  try {
    if (flow.intent === "link") {
      const token = req.signedCookies?.session;

      if (typeof token !== "string" || !token) {
        redirectResult(res, "invalid_session");
        return;
      }

      try {
        const sessionUserId = SessionService.verifySession(token).userId;

        if (
          sessionUserId !== flow.userId ||
          !(await isActiveProfileUser(sessionUserId))
        ) {
          redirectResult(res, "invalid_session");
          return;
        }
      } catch {
        redirectResult(res, "invalid_session");
        return;
      }
    }

    stage = "token_exchange";
    const tokens = await exchangeCode(provider, code, flow.codeVerifier);
    stage = "provider_profile";
    const profile = await getProviderProfile(provider, tokens.accessToken);

    stage = "account_resolution";
    const { session } = await resolveOAuthIdentity({
      provider,
      profile,
      tokens,
      userId: flow.userId,
    });

    res.cookie("session", session.token, {
      signed: true,
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000,
    });

    redirectResult(res, "success", flow);
  } catch (error) {
    if (error instanceof OAuthCallbackError) {
      redirectResult(res, error.code, flow, stage);
      return;
    }

    if (error instanceof ConflictError) {
      redirectResult(res, error.message, flow, stage);
      return;
    }

    console.error("OAuth callback processing failed", { provider, stage, errorType: error instanceof Error ? error.name : "unknown" });
    redirectResult(res, "internal_error", flow, stage);
  }
}
