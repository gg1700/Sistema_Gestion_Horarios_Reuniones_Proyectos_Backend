import { createHash, randomBytes } from "node:crypto";
import { oauthConfig } from "../config/oauth.config";
import { env } from "../config/env.config";
import { AuthorizationStart, OAuthProvider } from "../types/oauth.types";

interface AuthorizationOptions {
  redirectUri?: string;
  scopes?: readonly string[];
  prompt?: string;
}

export function buildOAuthReturnUrl(status: string, flow?: {
  provider: OAuthProvider; intent: "login" | "link"; returnTo?: string;
}): string {
  const url = new URL(env.FRONTEND_OAUTH_CALLBACK_URL);
  url.pathname = "/acceso";
  url.searchParams.set("oauth", status);
  if (flow) {
    url.searchParams.set("provider", flow.provider);
    url.searchParams.set("intent", flow.intent);
    const allowed = ["/panel", "/perfil/conexiones", "/perfil/conexiones/github", "/bienvenida"];
    url.searchParams.set("returnTo", flow.returnTo && allowed.includes(flow.returnTo) ? flow.returnTo : flow.intent === "link" ? "/perfil/conexiones" : "/panel");
  }
  return url.toString();
}

export function generateAuthorization(
  provider: OAuthProvider,
  options: AuthorizationOptions = {}
): AuthorizationStart {
  const configuration = oauthConfig[provider];

  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");

  const codeChallenge = createHash("sha256")
    .update(codeVerifier, "ascii")
    .digest("base64url");

  const url = new URL(configuration.authorizationEndpoint);

  url.searchParams.set("client_id", configuration.clientId);
  url.searchParams.set(
    "redirect_uri",
    options.redirectUri ?? configuration.redirectUri
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    (options.scopes ?? configuration.scopes).join(" ")
  );
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  if (provider === "google") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", options.prompt ?? "select_account");
  }

  return {
    authorizationUrl: url.toString(),
    flow: { provider, state, codeVerifier },
  };
}
