import type { OAuthProvider } from "./oauth.types";

export interface SessionProfile {
  id: string; handleName: string; name: string; firstSurname: string;
  email: string; profilePicture: string | null; requiresProfileCompletion: boolean;
}
export interface LinkedIdentity {
  provider: OAuthProvider; username: string | null; email: string | null;
  state: string; scopes: string[];
}
export interface AuthSession {
  authenticated: true; profile: SessionProfile; accounts: LinkedIdentity[];
}

