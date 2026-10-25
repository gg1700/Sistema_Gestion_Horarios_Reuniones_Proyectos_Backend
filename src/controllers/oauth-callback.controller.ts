import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.config";
import { validateProvider } from "../validators/oauth.validator";
import { exchangeCode, getProviderProfile } from "../services/oauth-callback.service";
import { saveExternalAccount } from "../repositories/oauth-callback.repository";
import { OAuthCallbackError } from "../types/oauth-callback.types";
import type { OAuthFlow } from "../types/oauth.types";

interface StoredOAuthFlow extends OAuthFlow {
  userId: string;
  issuedAt: number;
}

function redirectResult(res: Response, status: string): void {
  const url = new URL(env.FRONTEND_OAUTH_CALLBACK_URL);
  url.searchParams.set("oauth", status);
  res.redirect(302, url.toString());
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
    if (typeof data.userId !== "string" || !data.userId) return null;
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

  let provider: "google" | "github";

  try {
    provider = validateProvider(req.params.provider);
  } catch {
    redirectResult(res, "invalid_provider");
    return;
  }

  if (req.query.error === "access_denied") {
    redirectResult(res, "access_denied");
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

  try {
    const tokens = await exchangeCode(provider, code, flow.codeVerifier);
    const profile = await getProviderProfile(provider, tokens.accessToken);
    await saveExternalAccount({ userId: flow.userId, provider, profile, tokens });
    redirectResult(res, "success");
  } catch (error) {
    if (error instanceof OAuthCallbackError) {
      redirectResult(res, error.code);
      return;
    }

    if (error instanceof Error && error.name === "ConflictError") {
      redirectResult(res, "account_conflict");
      return;
    }

    console.error("OAuth callback processing failed");
    redirectResult(res, "internal_error");
  }
}
