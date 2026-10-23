import { env } from "./env.config";
import { OAuthProvider } from "../types/oauth.types";

interface ProviderConfiguration {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
}

export const oauthConfig: Record<OAuthProvider, ProviderConfiguration> = {
  google: {
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri: env.GOOGLE_REDIRECT_URI,
    scopes: ["openid", "profile", "email"],
  },
  github: {
    authorizationEndpoint: "https://github.com/login/oauth/authorize",
    clientId: env.GITHUB_CLIENT_ID,
    redirectUri: env.GITHUB_REDIRECT_URI,
    scopes: ["read:user", "user:email"],
  },
};
