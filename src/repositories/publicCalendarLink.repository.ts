import type { PoolClient } from "pg";
import { processReturnQuery } from "../utils/query";

export async function findPublicCalendarLink(
  userId: string,
): Promise<{ handleName: string; active: boolean } | null> {
  const rows = await processReturnQuery(
    `SELECT u.handle_name, COALESCE(link.active, FALSE) AS active
     FROM public."user" AS u
     LEFT JOIN public.public_calendar_link AS link ON link.user_id = u.id
     WHERE u.id = $1 AND u.deleted_at IS NULL AND u.status = 'active'`,
    [userId],
  );

  const row = rows[0];
  return row ? { handleName: row.handle_name, active: row.active } : null;
}

export async function findActiveUserHandle(
  client: PoolClient,
  userId: string,
): Promise<string | null> {
  const { rows } = await client.query<{ handle_name: string }>(
    `SELECT handle_name
     FROM public."user"
     WHERE id = $1 AND deleted_at IS NULL AND status = 'active'
     FOR UPDATE`,
    [userId],
  );

  return rows[0]?.handle_name ?? null;
}

export async function upsertPublicCalendarLink(
  client: PoolClient,
  userId: string,
  active: boolean,
): Promise<void> {
  await client.query(
    `INSERT INTO public.public_calendar_link (user_id, active)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE
     SET active = EXCLUDED.active, updated_at = NOW()`,
    [userId, active],
  );
}
