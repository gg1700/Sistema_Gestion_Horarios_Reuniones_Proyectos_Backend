import { processTransaction } from "../utils/query";
import { encryptToken } from "../utils/token";
import { ConflictError } from "../helpers/errors.helper";
import {
  OAuthCallbackError,
  type OAuthProviderProfile,
  type OAuthTokens
} from "../types/oauth-callback.types";

interface GoogleCalendarAuthorizationInput {
  userId: string;
  profile: OAuthProviderProfile;
  tokens: OAuthTokens;
}

export async function saveGoogleCalendarAuthorization({
  userId,
  profile,
  tokens
}: GoogleCalendarAuthorizationInput): Promise<void> {
  if (!tokens.refreshToken) {
    throw new OAuthCallbackError("missing_refresh_token");
  }

  if (!tokens.accessToken || !profile.id) {
    throw new OAuthCallbackError("invalid_code");
  }

  const accessToken = encryptToken(tokens.accessToken);
  const refreshToken = encryptToken(tokens.refreshToken);

  try {
    await processTransaction(async (client) => {
      const { rows: users } = await client.query(
        `SELECT id
         FROM public."user"
         WHERE id = $1
           AND deleted_at IS NULL
           AND status = 'active'`,
        [userId]
      );

      if (users.length === 0) {
        throw new OAuthCallbackError("invalid_session");
      }

      const { rows: linkedAccounts } = await client.query<{
        user_id: string;
      }>(
        `SELECT user_id
         FROM public.external_account
         WHERE provider = 'google'
           AND provider_user_id = $1
         FOR UPDATE`,
        [profile.id]
      );

      if (
        linkedAccounts.length > 0 &&
        linkedAccounts[0].user_id !== userId
      ) {
        throw new ConflictError("account_conflict");
      }

      const result = await client.query(
        `INSERT INTO public.external_account (
           user_id,
           provider,
           provider_user_id,
           provider_username,
           provider_user_email,
           access_token,
           refresh_token,
           access_expires_at,
           scopes,
           state
         )
         VALUES (
           $1, 'google', $2, $3, $4, $5,
           $6, $7, $8, 'active'
         )
         ON CONFLICT (user_id, provider)
         DO UPDATE SET
           provider_username = EXCLUDED.provider_username,
           provider_user_email = EXCLUDED.provider_user_email,
           access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           access_expires_at = EXCLUDED.access_expires_at,
           scopes = EXCLUDED.scopes,
           state = 'active',
           updated_at = NOW()
         WHERE public.external_account.provider_user_id =
               EXCLUDED.provider_user_id
         RETURNING id`,
        [
          userId,
          profile.id,
          profile.username,
          profile.email,
          accessToken,
          refreshToken,
          tokens.expiresAt,
          tokens.scopes
        ]
      );

      if (result.rowCount === 0) {
        throw new ConflictError("account_conflict");
      }
    });
  } catch (error) {
    const databaseError = error as { code?: string };

    if (databaseError.code === "23505") {
      throw new ConflictError("account_conflict");
    }

    throw error;
  }
}
