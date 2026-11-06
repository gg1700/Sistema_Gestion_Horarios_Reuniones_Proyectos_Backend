import type { PoolClient } from "pg";
import type { GoogleCalendarEvent } from "../types/calendarEvents.types";
import type {
  PublicCalendarEvent,
  PublicCalendarInterval,
  PublicCalendarRange,
} from "../types/publicCalendar.types";
import { processReturnQuery } from "../utils/query";
import { upsertCalendarEventMirror } from "./calendarEvents.repository";

interface PublicCalendarOwner {
  userId: string;
  handleName: string;
  connectionId: string | null;
  googleCalendarId: string | null;
  timeZone: string;
}

interface EventRange extends PublicCalendarRange {
  userId: string;
  connectionId: string;
  googleEventIds: string[];
}

interface IntervalRow {
  starts_at: Date;
  ends_at: Date;
}

const eventsInRange = `FROM public.calendar_event
  WHERE user_id = $1 AND calendar_connection_id = $2
    AND starts_at < $4::timestamptz AND ends_at > $3::timestamptz
    AND google_event_id = ANY($5::text[]) AND event_status <> 'cancelled'`;

function mapInterval(row: IntervalRow): PublicCalendarInterval {
  return { startsAt: row.starts_at.toISOString(), endsAt: row.ends_at.toISOString() };
}

export async function findActivePublicCalendarByHandle(
  handle: string,
  client?: PoolClient,
): Promise<PublicCalendarOwner | null> {
  const sql = `SELECT u.id AS "userId", u.handle_name AS "handleName",
      cc.id AS "connectionId", cc.google_calendar_id AS "googleCalendarId",
      COALESCE(settings.timezone, cc.timezone, 'UTC') AS "timeZone"
    FROM public."user" u
    JOIN public.public_calendar_link link ON link.user_id = u.id AND link.active = TRUE
    LEFT JOIN public.calendar_settings settings ON settings.user_id = u.id
    LEFT JOIN public.external_account ea
      ON ea.user_id = u.id AND ea.provider = 'google' AND ea.state = 'active'
    LEFT JOIN public.calendar_connection cc
      ON cc.external_account_id = ea.id AND cc.status = 'connected'
    WHERE u.handle_name = $1 AND u.status = 'active' AND u.deleted_at IS NULL`;

  const rows = client
    ? (await client.query<PublicCalendarOwner>(`${sql} FOR NO KEY UPDATE OF u FOR SHARE OF link`, [handle])).rows
    : await processReturnQuery(sql, [handle]);

  return rows[0] ?? null;
}

export async function refreshEventMirrors(
  client: PoolClient,
  userId: string,
  connectionId: string,
  googleCalendarId: string,
  events: GoogleCalendarEvent[],
): Promise<void> {
  const { rows } = await client.query<{
    google_event_id: string;
    provider_updated_at: Date | null;
    event_status: string;
    sync_status: string;
  }>(
    `SELECT google_event_id, provider_updated_at, event_status, sync_status
     FROM public.calendar_event
     WHERE user_id = $1 AND calendar_connection_id = $2 AND google_event_id = ANY($3::text[])
     ORDER BY google_event_id
     FOR UPDATE`,
    [userId, connectionId, events.map(event => event.id)],
  );
  const mirrors = new Map(rows.map(row => [row.google_event_id, row]));

  for (const event of events) {
    const mirror = mirrors.get(event.id);
    if (mirror?.provider_updated_at && event.providerUpdatedAt) {
      const localVersion = mirror.provider_updated_at.getTime();
      const remoteVersion = Date.parse(event.providerUpdatedAt);
      if (localVersion > remoteVersion || (
        localVersion === remoteVersion &&
        mirror.event_status === event.eventStatus && mirror.sync_status === "synced"
      )) continue;
    }

    await upsertCalendarEventMirror({
      userId,
      calendarConnectionId: connectionId,
      googleCalendarId,
      googleEventId: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timeZone: event.timeZone,
      eventStatus: event.eventStatus,
      providerUpdatedAt: event.providerUpdatedAt,
    }, client);
  }
}

export async function findPublicEventsInRange(
  client: PoolClient,
  { userId, connectionId, from, to, googleEventIds }: EventRange,
): Promise<PublicCalendarEvent[]> {
  const { rows } = await client.query<IntervalRow & {
    title: string;
    description: string | null;
    location: string | null;
    timezone: string;
  }>(
    `SELECT title, description, location, starts_at, ends_at, timezone
     ${eventsInRange} AND is_public = TRUE
     ORDER BY starts_at, ends_at, id`,
    [userId, connectionId, from, to, googleEventIds],
  );

  return rows.map(row => ({
    title: row.title,
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.location !== null ? { location: row.location } : {}),
    ...mapInterval(row),
    timeZone: row.timezone,
  }));
}

export async function findAllBusyEventsInRange(
  client: PoolClient,
  { userId, connectionId, from, to, googleEventIds }: EventRange,
): Promise<PublicCalendarInterval[]> {
  const { rows } = await client.query<IntervalRow>(
    `SELECT GREATEST(starts_at, $3::timestamptz) AS starts_at,
            LEAST(ends_at, $4::timestamptz) AS ends_at
     ${eventsInRange}
     ORDER BY starts_at, ends_at, id`,
    [userId, connectionId, from, to, googleEventIds],
  );

  return rows.map(mapInterval);
}

export async function findAvailabilityRules(
  client: PoolClient,
  userId: string,
  timeZone: string,
  { from, to }: PublicCalendarRange,
): Promise<PublicCalendarInterval[]> {
  const zone = /^[+-]/.test(timeZone) ? "$4::interval" : "$4::text";
  const { rows } = await client.query<IntervalRow>(
    `WITH local_days AS (
       SELECT day::date AS day
       FROM generate_series(
         ($2::timestamptz AT TIME ZONE ${zone})::date::timestamp,
         ($3::timestamptz AT TIME ZONE ${zone})::date::timestamp,
         INTERVAL '1 day'
       ) AS day
     ), local_windows AS (
       SELECT day + r.start_time AS local_start, day + r.end_time AS local_end
       FROM local_days
       JOIN public.availability_rule r ON r.day_of_week = EXTRACT(DOW FROM day)
       WHERE r.user_id = $1 AND r.active = TRUE
     ), zoned_windows AS (
       SELECT local_start, local_end,
              local_start AT TIME ZONE ${zone} AS starts_at,
              local_end AT TIME ZONE ${zone} AS ends_at
       FROM local_windows
     )
     SELECT GREATEST(starts_at, $2::timestamptz) AS starts_at,
            LEAST(ends_at, $3::timestamptz) AS ends_at
     FROM zoned_windows
     WHERE GREATEST(starts_at, $2::timestamptz) < LEAST(ends_at, $3::timestamptz)
       AND local_start = starts_at AT TIME ZONE ${zone}
       AND local_end = ends_at AT TIME ZONE ${zone}
     ORDER BY starts_at, ends_at`,
    [userId, from, to, timeZone],
  );

  return rows.map(mapInterval);
}
