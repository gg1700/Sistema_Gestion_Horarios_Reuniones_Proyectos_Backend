import { processReturnQuery } from "../utils/query";

interface PublicCalendarOwnerRow {
  id: string;
  handle_name: string;
  name: string;
  first_surname: string;
  time_zone: string;
  calendar_active: boolean;
}

export interface PublicAvailabilityRuleRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface PublicBusyIntervalRow {
  starts_at: Date | string;
  ends_at: Date | string;
}

export async function findOwnerByHandle(
  handle: string,
): Promise<PublicCalendarOwnerRow | null> {
  const rows = await processReturnQuery(
    `SELECT
       u.id,
       u.handle_name,
       COALESCE(u.name, '') AS name,
       COALESCE(u.first_surname, '') AS first_surname,
       COALESCE(
         cs.timezone,
         (
           SELECT cc.timezone
           FROM public.calendar_connection cc
           JOIN public.external_account ea
             ON ea.id = cc.external_account_id
           WHERE ea.user_id = u.id
             AND ea.provider = 'google'
           LIMIT 1
         ),
         'UTC'
       ) AS time_zone,
       COALESCE(pcl.active, FALSE) AS calendar_active
     FROM public."user" u
     LEFT JOIN public.calendar_settings cs
       ON cs.user_id = u.id
     LEFT JOIN public.public_calendar_link pcl
       ON pcl.user_id = u.id
     WHERE LOWER(u.handle_name) = LOWER($1)
       AND u.deleted_at IS NULL
       AND u.status = 'active'
     LIMIT 1`,
    [handle],
  );

  return (rows[0] as PublicCalendarOwnerRow | undefined) ?? null;
}

export async function findActiveAvailabilityRules(
  userId: string,
): Promise<PublicAvailabilityRuleRow[]> {
  const rows = await processReturnQuery(
    `SELECT
       day_of_week,
       TO_CHAR(start_time, 'HH24:MI') AS start_time,
       TO_CHAR(end_time, 'HH24:MI') AS end_time
     FROM public.availability_rule
     WHERE user_id = $1
       AND active = TRUE
     ORDER BY day_of_week, start_time`,
    [userId],
  );

  return rows as PublicAvailabilityRuleRow[];
}

export async function findBusyIntervals(
  userId: string,
  from: Date,
  to: Date,
): Promise<PublicBusyIntervalRow[]> {
  const rows = await processReturnQuery(
    `SELECT
       starts_at,
       ends_at
     FROM public.calendar_event
     WHERE user_id = $1
       AND event_status <> 'cancelled'
       AND starts_at < $3
       AND ends_at > $2

     UNION ALL

     SELECT
       requested_start_at AS starts_at,
       requested_end_at AS ends_at
     FROM public.meeting_request
     WHERE recipient_user_id = $1
       AND status = 'pending'
       AND requested_start_at < $3
       AND requested_end_at > $2`,
    [userId, from, to],
  );

  return rows as PublicBusyIntervalRow[];
}