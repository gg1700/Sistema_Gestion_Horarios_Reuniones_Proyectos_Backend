import { createHash, randomBytes } from "node:crypto";
import { oauthConfig } from "../config/oauth.config";
import { AuthorizationStart, OAuthProvider } from "../types/oauth.types";

export function generateAuthorization(provider: OAuthProvider): AuthorizationStart {
  const configuration = oauthConfig[provider];
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier, "ascii")
    .digest("base64url");

  const url = new URL(configuration.authorizationEndpoint);
  url.searchParams.set("client_id", configuration.clientId);
  url.searchParams.set("redirect_uri", configuration.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", configuration.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return {
    authorizationUrl: url.toString(),
    flow: { provider, state, codeVerifier },
  };
}
