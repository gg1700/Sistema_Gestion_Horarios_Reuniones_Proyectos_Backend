
import type { OAuthProvider } from "./oauth.types";

export interface OAuthProviderProfile {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string;
}

export interface OAuthLinkedAccount {
  userId: string;
  provider: OAuthProvider;
  profile: OAuthProviderProfile;
  tokens: OAuthTokens;
}

export class OAuthCallbackError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "OAuthCallbackError";
  }
}
