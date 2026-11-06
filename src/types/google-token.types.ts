export interface GoogleTokenAccount {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  access_expires_at: Date | null;
  state: string;
}

export interface RefreshedGoogleToken {
  accessToken: string;
  expiresAt: Date;
  refreshToken?: string;
}