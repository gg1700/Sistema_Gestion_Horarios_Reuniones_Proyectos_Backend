export type OAuthProvider = "google" | "github";

export interface OAuthFlow {
  provider: OAuthProvider;
  state: string;
  codeVerifier: string;
}

export interface AuthorizationStart {
  authorizationUrl: string;
  flow: OAuthFlow;
}
