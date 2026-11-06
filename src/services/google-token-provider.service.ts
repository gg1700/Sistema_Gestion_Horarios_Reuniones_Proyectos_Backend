import { env } from "../config/env.config";
import type { RefreshedGoogleToken } from "../types/google-token.types";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const TIMEOUT_MS = 8000;

export class GoogleTokenRefreshError extends Error {
  constructor(
    public readonly code: "refresh_revoked" | "refresh_failed"
  ) {
    super(code);
    this.name = "GoogleTokenRefreshError";
  }
}

export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<RefreshedGoogleToken> {
  let response: Response;

  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error"
    });
  } catch {
    throw new GoogleTokenRefreshError("refresh_failed");
  }

  let data: Record<string, unknown>;

  try {
    const payload: unknown = await response.json();

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid token response");
    }

    data = payload as Record<string, unknown>;
  } catch {
    throw new GoogleTokenRefreshError("refresh_failed");
  }

  if (!response.ok || typeof data.error === "string") {
    if (response.status === 400 && data.error === "invalid_grant") {
      throw new GoogleTokenRefreshError("refresh_revoked");
    }

    throw new GoogleTokenRefreshError("refresh_failed");
  }

  const accessToken = data.access_token;
  const expiresIn = data.expires_in;

  if (
    typeof accessToken !== "string" ||
    !accessToken.trim() ||
    typeof expiresIn !== "number" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new GoogleTokenRefreshError("refresh_failed");
  }

  return {
    accessToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    ...(typeof data.refresh_token === "string" &&
    data.refresh_token.trim()
      ? { refreshToken: data.refresh_token }
      : {})
  };
}
