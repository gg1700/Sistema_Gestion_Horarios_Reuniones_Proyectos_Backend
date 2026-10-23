export enum ExternalProvider {
  GOOGLE = "google",
  GITHUB = "github"
}

export interface ExternalAccountDB {
  id: string;
  provider: string;
  provider_user_id: string;
  provider_user_name?: string;
  provider_user_email?: string;
  access_token: string;
  refresh_token?: string;
  scopes?: string;
  state?: string;
}