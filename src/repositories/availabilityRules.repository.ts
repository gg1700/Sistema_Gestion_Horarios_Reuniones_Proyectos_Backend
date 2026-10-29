import type { PoolClient } from "pg";
import { processReturnQuery } from "../utils/query";
import type {
  AvailabilityRuleInput,
  AvailabilityRuleResponse,
} from "../types/availabilityRules.types";

interface AvailabilityRuleRow {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
}

function mapRule(row: AvailabilityRuleRow): AvailabilityRuleResponse {
  return {
    id: row.id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    active: row.active,
  };
}

export async function findCalendarSettings(
  userId: string,
): Promise<string | null> {
  const rows = await processReturnQuery(
    `SELECT timezone
     FROM public.calendar_settings
     WHERE user_id = $1`,
    [userId],
  );

  return (rows[0]?.timezone as string | undefined) ?? null;
}

export async function findGoogleCalendarTimeZone(
  userId: string,
): Promise<string | null> {
  const rows = await processReturnQuery(
    `SELECT cc.timezone
     FROM public.calendar_connection cc
     JOIN public.external_account ea
       ON ea.id = cc.external_account_id
     WHERE ea.user_id = $1
       AND ea.provider = 'google'
     LIMIT 1`,
    [userId],
  );

  return (rows[0]?.timezone as string | undefined) ?? null;
}

export async function findAvailabilityRules(
  userId: string,
): Promise<AvailabilityRuleResponse[]> {
  const rows = (await processReturnQuery(
    `SELECT
       id,
       day_of_week,
       to_char(start_time, 'HH24:MI') AS start_time,
       to_char(end_time, 'HH24:MI') AS end_time,
       active
     FROM public.availability_rule
     WHERE user_id = $1
     ORDER BY day_of_week, start_time, id`,
    [userId],
  )) as AvailabilityRuleRow[];

  return rows.map(mapRule);
}

export async function lockAvailabilityOwner(
  client: PoolClient,
  userId: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT id
     FROM public."user"
     WHERE id = $1
       AND deleted_at IS NULL
     FOR UPDATE`,
    [userId],
  );

  return result.rowCount === 1;
}

export async function upsertCalendarSettings(
  client: PoolClient,
  userId: string,
  timeZone: string,
): Promise<void> {
  await client.query(
    `INSERT INTO public.calendar_settings (user_id, timezone)
     VALUES ($1, $2)
     ON CONFLICT (user_id)
     DO UPDATE SET
       timezone = EXCLUDED.timezone,
       updated_at = CASE
         WHEN public.calendar_settings.timezone IS DISTINCT FROM EXCLUDED.timezone
         THEN NOW()
         ELSE public.calendar_settings.updated_at
       END`,
    [userId, timeZone],
  );
}

export async function replaceAvailabilityRules(
  client: PoolClient,
  userId: string,
  rules: AvailabilityRuleInput[],
): Promise<AvailabilityRuleResponse[]> {
  const selected: AvailabilityRuleResponse[] = [];

  for (const rule of rules) {
    const result = await client.query<AvailabilityRuleRow>(
      `INSERT INTO public.availability_rule (
         user_id, day_of_week, start_time, end_time, active
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, day_of_week, start_time, end_time)
       DO UPDATE SET
         active = EXCLUDED.active,
         updated_at = CASE
           WHEN public.availability_rule.active IS DISTINCT FROM EXCLUDED.active
           THEN NOW()
           ELSE public.availability_rule.updated_at
         END
       RETURNING
         id,
         day_of_week,
         to_char(start_time, 'HH24:MI') AS start_time,
         to_char(end_time, 'HH24:MI') AS end_time,
         active`,
      [
        userId,
        rule.dayOfWeek,
        rule.startTime,
        rule.endTime,
        rule.active,
      ],
    );

    selected.push(mapRule(result.rows[0]));
  }

  await client.query(
    `DELETE FROM public.availability_rule
     WHERE user_id = $1
       AND NOT (id = ANY($2::uuid[]))`,
    [userId, selected.map((rule) => rule.id)],
  );

  return selected.sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek ||
      a.startTime.localeCompare(b.startTime),
  );
}