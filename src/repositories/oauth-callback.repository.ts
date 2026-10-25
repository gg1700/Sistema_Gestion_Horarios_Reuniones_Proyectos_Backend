
import pool from "../config/database.config";
import type { OAuthLinkedAccount } from "../types/oauth-callback.types";
import { encryptToken } from "../utils/token";
import { ConflictError } from "../helpers/errors.helper";

export async function saveExternalAccount(account: OAuthLinkedAccount): Promise<void> {
  const { userId, provider, profile, tokens } = account;
  const accessToken = encryptToken(tokens.accessToken);
  const refreshToken = tokens.refreshToken ? encryptToken(tokens.refreshToken) : null;

  const result = await pool.query(
    `INSERT INTO public.external_account (
      user_id, provider, provider_user_id, provider_username,
      provider_user_email, access_token, refresh_token,
      access_expires_at, scopes, state
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
    ON CONFLICT (user_id, provider)
    DO UPDATE SET
      provider_username = EXCLUDED.provider_username,
      provider_user_email = EXCLUDED.provider_user_email,
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, public.external_account.refresh_token),
      access_expires_at = EXCLUDED.access_expires_at,
      scopes = EXCLUDED.scopes,
      state = 'active',
      updated_at = NOW()
    WHERE public.external_account.provider_user_id = EXCLUDED.provider_user_id
    RETURNING id`,
    [
      userId, provider, profile.id, profile.username, profile.email,
      accessToken, refreshToken, tokens.expiresAt, tokens.scopes,
    ]
  );

  if (result.rowCount === 0) {
    throw new ConflictError("Ya tienes vinculada otra cuenta de este proveedor");
  }
}
