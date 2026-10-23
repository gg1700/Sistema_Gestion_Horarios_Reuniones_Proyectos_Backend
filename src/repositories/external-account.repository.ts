import type { PoolClient } from "pg";
import type { ExternalAccountForRevocation } from "../types/account-deletion.types";

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
