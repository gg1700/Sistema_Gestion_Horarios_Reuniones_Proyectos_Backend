import type { PoolClient } from "pg";

export interface AccountToDelete {
  email: string;
  contact_emails: string[];
}

export async function lockAccount(client: PoolClient, userId: string): Promise<AccountToDelete | undefined> {
  const { rows } = await client.query<AccountToDelete>(
    `SELECT u.email, ARRAY(
       SELECT e.address FROM public.user_email ue JOIN public.email e ON e.id = ue.email_id
       WHERE ue.user_id = u.id
     ) AS contact_emails
     FROM public."user" u WHERE u.id = $1 AND u.deleted_at IS NULL FOR UPDATE OF u`,
    [userId]
  );
  return rows[0];
}

export async function invalidateAccountSessions(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `UPDATE public."user" SET deleted_at = now(), status = 'deleted',
       public_link_active = false, updated_at = now() WHERE id = $1`,
    [userId]
  );
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function deletePersonalData(client: PoolClient, userId: string): Promise<void> {
  const { rows: phones } = await client.query<{ phone_id: string }>(
    `SELECT phone_id FROM public.user_phone WHERE user_id = $1`, [userId]
  );
  const { rows: emails } = await client.query<{ email_id: string }>(
    `SELECT email_id FROM public.user_email WHERE user_id = $1`, [userId]
  );

  const { rows: dependents } = await client.query<{
    schema_name: string; table_name: string; column_name: string;
  }>(
    `SELECT DISTINCT n.nspname AS schema_name, t.relname AS table_name, a.attname AS column_name
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.confrelid = 'public."user"'::regclass
       AND cardinality(c.conkey) = 1 AND c.conrelid <> c.confrelid
     ORDER BY n.nspname, t.relname, a.attname`
  );
  for (const dependent of dependents) {
    await client.query(
      `DELETE FROM ${quoteIdentifier(dependent.schema_name)}.${quoteIdentifier(dependent.table_name)}
       WHERE ${quoteIdentifier(dependent.column_name)} = $1`,
      [userId]
    );
  }

  await client.query(
    `DELETE FROM public.phone p WHERE p.id = ANY($1::uuid[])
     AND NOT EXISTS (SELECT 1 FROM public.user_phone up WHERE up.phone_id = p.id)`,
    [phones.map(phone => phone.phone_id)]
  );
  await client.query(
    `DELETE FROM public.email e WHERE e.id = ANY($1::uuid[])
     AND NOT EXISTS (SELECT 1 FROM public.user_email ue WHERE ue.email_id = e.id)`,
    [emails.map(email => email.email_id)]
  );
  await client.query(
    `UPDATE public."user" SET handle_name = 'deleted-' || gen_random_uuid()::text,
       name = NULL, first_surname = NULL, email = NULL, password_hash = NULL,
       profile_picture = NULL, status = 'deleted', deleted_at = COALESCE(deleted_at, now()),
       public_link_active = false, updated_at = now() WHERE id = $1`,
    [userId]
  );
}
