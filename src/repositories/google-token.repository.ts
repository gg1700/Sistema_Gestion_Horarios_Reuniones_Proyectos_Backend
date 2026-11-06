import type { PoolClient } from "pg";
import { encryptToken } from "../utils/token";
import type {
  GoogleTokenAccount,
  RefreshedGoogleToken
} from "../types/google-token.types";


export async function findGoogleAccountForUpdate(
  client: PoolClient,
  userId: string
): Promise<GoogleTokenAccount | null> {
  const { rows } = await client.query<GoogleTokenAccount>(
    `SELECT
       ea.id,
       ea.user_id,
       ea.access_token,
       ea.refresh_token,
       ea.access_expires_at,
       ea.state
     FROM public.external_account ea
     JOIN public."user" u ON u.id = ea.user_id
     WHERE ea.user_id = $1
       AND ea.provider = 'google'
       AND u.deleted_at IS NULL
       AND u.status = 'active'
       AND (
         ea.scopes LIKE '%https://www.googleapis.com/auth/calendar.events%'
         OR ea.scopes LIKE '%https://www.googleapis.com/auth/calendar.calendarlist.readonly%'
       )
     FOR UPDATE OF ea`,
    [userId]
  );

  return rows[0] ?? null;
}

export async function updateGoogleAccessToken(
  client: PoolClient,
  accountId: string,
  token: RefreshedGoogleToken
): Promise<void> {
  const result = await client.query(
    `UPDATE public.external_account
     SET access_token = $2,
         refresh_token = COALESCE($3, refresh_token),
         access_expires_at = $4,
         state = 'active',
         updated_at = NOW()
     WHERE id = $1
       AND provider = 'google'
     RETURNING id`,
    [
      accountId,
      encryptToken(token.accessToken),
      token.refreshToken ? encryptToken(token.refreshToken) : null,
      token.expiresAt
    ]
  );

  if (result.rowCount !== 1) {
    throw new Error("Google account not found during token refresh");
  }
}

export async function markGoogleReconnectionRequired(
  client: PoolClient,
  accountId: string
): Promise<void> {
  await client.query(
    `UPDATE public.external_account
     SET state = 'revoked',
         updated_at = NOW()
     WHERE id = $1 AND provider = 'google'`,
    [accountId]
  );

  await client.query(
    `UPDATE public.calendar_connection
     SET status = 'reconnection_required',
         updated_at = NOW()
     WHERE external_account_id = $1`,
    [accountId]
  );
}