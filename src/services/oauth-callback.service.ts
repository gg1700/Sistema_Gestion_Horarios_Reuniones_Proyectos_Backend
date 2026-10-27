
import { oauthConfig } from "../config/oauth.config";
import { env } from "../config/env.config";
import type { OAuthProvider } from "../types/oauth.types";
import { OAuthCallbackError, type OAuthProviderProfile, type OAuthTokens } from "../types/oauth-callback.types";

const TIMEOUT_MS = 8000;

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

async function apiFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
  } catch {
    throw new OAuthCallbackError("provider_unavailable");
  }
}

async function jsonObject(response: Response): Promise<Record<string, unknown>> {
  try {
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid provider response");
    return result as Record<string, unknown>;
  } catch {
    throw new OAuthCallbackError("provider_unavailable");
  }
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function getVerifiedGitHubEmail(data: unknown): string | null {
  if (!Array.isArray(data)) return null;

  const emails = data.filter(
    (item): item is GitHubEmail =>
      item !== null &&
      typeof item === "object" &&
      typeof item.email === "string" &&
      typeof item.primary === "boolean" &&
      typeof item.verified === "boolean"
  );

  const found = emails.find(item => item.primary && item.verified) ?? emails.find(item => item.verified);
  return optionalString(found?.email);
}

export async function exchangeCode(provider: OAuthProvider, code: string, codeVerifier: string): Promise<OAuthTokens> {
  const config = oauthConfig[provider];
  const tokenEndpoint = provider === "google"
    ? "https://oauth2.googleapis.com/token"
    : "https://github.com/login/oauth/access_token";

  const response = await apiFetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: provider === "google" ? env.GOOGLE_CLIENT_SECRET : env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    if (response.status >= 500 || response.status === 429) throw new OAuthCallbackError("provider_unavailable");
    throw new OAuthCallbackError("invalid_code");
  }

  const data = await jsonObject(response);

  if (typeof data.error === "string") {
    if (data.error === "temporarily_unavailable" || data.error === "server_error") {
      throw new OAuthCallbackError("provider_unavailable");
    }
    throw new OAuthCallbackError("invalid_code");
  }

  const accessToken = optionalString(data.access_token);
  if (!accessToken) throw new OAuthCallbackError("invalid_code");

  const lifetime = typeof data.expires_in === "number" && Number.isFinite(data.expires_in) && data.expires_in > 0
    ? data.expires_in : null;

  return {
    accessToken,
    refreshToken: optionalString(data.refresh_token),
    expiresAt: lifetime === null ? null : new Date(Date.now() + lifetime * 1000),
    scopes: typeof data.scope === "string" ? data.scope : "",
  };
}

export async function getProviderProfile(provider: OAuthProvider, accessToken: string): Promise<OAuthProviderProfile> {
  const profileEndpoint = provider === "google"
    ? "https://openidconnect.googleapis.com/v1/userinfo"
    : "https://api.github.com/user";

  const response = await apiFetch(profileEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: provider === "github" ? "application/vnd.github+json" : "application/json",
      "User-Agent": "telematics-backend",
    },
  });

  if (!response.ok) throw new OAuthCallbackError("provider_unavailable");

  const data = await jsonObject(response);
  const id = provider === "google"? optionalString(data.sub): typeof data.id === "number" || typeof data.id === "string" ? String(data.id) : null;

  if (!id || id.length > 100) throw new OAuthCallbackError("provider_unavailable");

  let email: string | null = null;

  if (provider === "google" && data.email_verified === true) {
    email = optionalString(data.email);
  }

  if (provider === "github") {
    try {
      const emailsResponse = await apiFetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "telematics-backend",
        },
      });

      if (emailsResponse.ok) {
        const emailsData: unknown = await emailsResponse.json();
        email = getVerifiedGitHubEmail(emailsData);
      } else {
        console.warn("GitHub verified email could not be retrieved");
      }
    } catch {
      console.warn("GitHub email lookup failed; continuing without email");
    }
  }

  return {
    id,
    username: provider === "google" ? optionalString(data.email) : optionalString(data.login),
    name: optionalString(data.name),
    email,
    avatarUrl: provider === "google" ? optionalString(data.picture) : optionalString(data.avatar_url),
    profileUrl: provider === "google" ? null : optionalString(data.html_url),
  };
}
