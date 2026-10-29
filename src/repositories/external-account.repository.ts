import type { PoolClient } from "pg";
import type { ExternalAccountForRevocation } from "../types/account-deletion.types";
import { processReturnQuery } from "../utils/query";

export async function findAccountsForRevocation(client: PoolClient, userId: string): Promise<ExternalAccountForRevocation[]> {
  // T-24 is not integrated yet. Without its table there can be no linked accounts.
  const { rows: tables } = await client.query<{ table_name: string | null }>(
    `SELECT to_regclass('public.external_account')::text AS table_name`
  );
  if (!tables[0].table_name) return [];

  const { rows } = await client.query<ExternalAccountForRevocation>(
    `SELECT a.provider, a.access_token, a.refresh_token
     FROM public.external_account a
     JOIN public."user" u ON u.id = a.user_id
     WHERE a.user_id = $1 AND u.deleted_at IS NULL`,
    [userId]
  );
  return rows;
}

export async function findExternalAccountByProvider(userId: string, provider: string) {
  const query = `SELECT provider_username, provider_user_email, access_token, 
    refresh_token, state FROM "external_account"
    WHERE user_id = $1 AND provider = $2`;
  const values = [userId, provider];
  const externalAccount = processReturnQuery(query, values);
  return externalAccount;
}

export async function updateExternalAccountState(state: string, id: string, userId: string) {
  const query = `UPDATE "external_account"
    SET state = $1
    WHERE id = $2 AND user_id = $3`;
  const values = [state, id, userId];
  await processReturnQuery(query, values);
}