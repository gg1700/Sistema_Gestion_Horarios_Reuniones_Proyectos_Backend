export interface DeleteAccountRequest {
  confirmation: string;
}

export interface ExternalAccountForRevocation {
  provider: string;
  access_token: string;
  refresh_token: string | null;
}
