import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.config";
import { generateAuthorization } from "../services/oauth.service";
import {
  exchangeCode,
  getProviderProfile
} from "../services/oauth-callback.service";
import { verifySession } from "../services/session.service";
import { isActiveProfileUser } from "../repositories/profile-read.repository";
import { saveGoogleCalendarAuthorization } from "../repositories/google-calendar-auth.repository";
import { OAuthCallbackError } from "../types/oauth-callback.types";
import { ConflictError } from "../helpers/errors.helper";

const FLOW_COOKIE = "calendar_oauth_flow";
const FLOW_PATH = "/api/v1/integrations/google-calendar";
const FLOW_DURATION = 5 * 60 * 1000;

const CALENDAR_SCOPES = [
  "openid",
  "profile",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events"
] as const;

interface CalendarFlow {
  state: string;
  codeVerifier: string;
  userId: string;
  issuedAt: number;
}

function redirectResult(res: Response, status: string): void {
  const url = new URL(env.FRONTEND_OAUTH_CALLBACK_URL);
  url.searchParams.set("calendar_oauth", status);

  res.redirect(302, url.toString());
}

function readFlow(value: unknown): CalendarFlow | null {
  if (typeof value !== "string") return null;

  try {
    const parsed: unknown = JSON.parse(value);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const data = parsed as Record<string, unknown>;

    if (
      typeof data.state !== "string" ||
      !data.state ||
      typeof data.codeVerifier !== "string" ||
      !data.codeVerifier ||
      typeof data.userId !== "string" ||
      !data.userId ||
      typeof data.issuedAt !== "number" ||
      !Number.isFinite(data.issuedAt)
    ) {
      return null;
    }

    return data as unknown as CalendarFlow;
  } catch {
    return null;
  }
}

function validState(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

async function getAuthenticatedUserId(
  req: Request
): Promise<string | null> {
  const token = req.signedCookies?.session;

  if (typeof token !== "string" || !token) {
    return null;
  }

  try {
    const { userId } = verifySession(token);
    const active = await isActiveProfileUser(userId);

    return active ? userId : null;
  } catch {
    return null;
  }
}

export async function connectGoogleCalendar(
  req: Request,
  res: Response
): Promise<void> {
  res.set("Cache-Control", "no-store");

  try {
    const userId = await getAuthenticatedUserId(req);

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Sesion invalida o expirada",
        errorCode: "invalid_session"
      });
      return;
    }

    const { authorizationUrl, flow } = generateAuthorization(
      "google",
      {
        redirectUri: env.GOOGLE_CALENDAR_REDIRECT_URI,
        scopes: CALENDAR_SCOPES,
        prompt: "consent"
      }
    );

    const storedFlow: CalendarFlow = {
      state: flow.state,
      codeVerifier: flow.codeVerifier,
      userId,
      issuedAt: Date.now()
    };

    res.cookie(FLOW_COOKIE, JSON.stringify(storedFlow), {
      signed: true,
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: FLOW_PATH,
      maxAge: FLOW_DURATION
    });

    res.redirect(302, authorizationUrl);
  } catch {
    console.error("Google Calendar authorization start failed");

    res.status(500).json({
      success: false,
      message: "No se pudo iniciar la autorizacion",
      errorCode: "internal_error"
    });
  }
}

export async function googleCalendarCallback(
  req: Request,
  res: Response
): Promise<void> {
  res.set("Cache-Control", "no-store");

  const flow = readFlow(req.signedCookies?.[FLOW_COOKIE]);

  res.clearCookie(FLOW_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: FLOW_PATH
  });

  const receivedState =
    typeof req.query.state === "string"
      ? req.query.state
      : "";

  if (
    !flow ||
    !receivedState ||
    Date.now() - flow.issuedAt > FLOW_DURATION ||
    flow.issuedAt > Date.now() ||
    !validState(receivedState, flow.state)
  ) {
    redirectResult(res, "invalid_state");
    return;
  }

  if (req.query.error === "access_denied") {
    redirectResult(res, "access_denied");
    return;
  }

  if (typeof req.query.error === "string") {
    redirectResult(res, "provider_unavailable");
    return;
  }

  try {
    const userId = await getAuthenticatedUserId(req);

    if (!userId || userId !== flow.userId) {
      redirectResult(res, "invalid_session");
      return;
    }

    const code =
      typeof req.query.code === "string"
        ? req.query.code
        : "";

    if (!code) {
      redirectResult(res, "invalid_code");
      return;
    }

    const tokens = await exchangeCode(
      "google",
      code,
      flow.codeVerifier,
      env.GOOGLE_CALENDAR_REDIRECT_URI
    );

    if (!tokens.refreshToken) {
      redirectResult(res, "missing_refresh_token");
      return;
    }

    const grantedScopes = new Set(
      tokens.scopes.split(/\s+/).filter(Boolean)
    );

    const requiredScopes = CALENDAR_SCOPES.slice(3);

    if (
      tokens.scopes &&
      !requiredScopes.every(scope => grantedScopes.has(scope))
    ) {
      redirectResult(res, "insufficient_scope");
      return;
    }

    const profile = await getProviderProfile(
      "google",
      tokens.accessToken
    );

    await saveGoogleCalendarAuthorization({
      userId,
      profile,
      tokens
    });

    redirectResult(res, "success");
  } catch (error) {
    if (error instanceof OAuthCallbackError) {
      redirectResult(res, error.code);
      return;
    }

    if (error instanceof ConflictError) {
      redirectResult(res, error.message);
      return;
    }

    console.error("Google Calendar OAuth callback failed");
    redirectResult(res, "internal_error");
  }
}
