import type { PoolClient } from "pg";
import { processReturnQuery, processTransaction } from "../utils/query";
import type {
  CalendarEventMirror,
  CalendarEventRangeQuery,
  CalendarEventStatus,
  CalendarEventSyncStatus,
  GoogleCalendarForUser,
} from "../types/calendarEvents.types";

interface GoogleCalendarRow {
  connection_id: string;
  external_account_id: string;
  google_calendar_id: string;
  calendar_name: string;
  timezone: string;
  connection_status: string;
  account_state: string;
}

interface CalendarEventRow {
  id: string;
  user_id: string;
  calendar_connection_id: string;
  google_event_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: Date | string;
  ends_at: Date | string;
  timezone: string;
  is_public: boolean;
  event_status: CalendarEventStatus;
  sync_status: CalendarEventSyncStatus;
  provider_updated_at: Date | string | null;
  synced_at: Date | string;
}

export interface UpsertCalendarEventMirrorInput {
  userId: string;
  calendarConnectionId: string;
  googleEventId: string;
  googleCalendarId?: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  isPublic?: boolean;
  eventStatus?: CalendarEventStatus;
  syncStatus?: CalendarEventSyncStatus;
  providerUpdatedAt?: string | null;
}

const eventColumns = `
  id,
  user_id,
  calendar_connection_id,
  google_event_id,
  title,
  description,
  location,
  starts_at,
  ends_at,
  timezone,
  is_public,
  event_status,
  sync_status,
  provider_updated_at,
  synced_at
`;

function toISO(value: Date | string): string {
  return new Date(value).toISOString();
}

function mapCalendarEvent(row: CalendarEventRow): CalendarEventMirror {
  return {
    id: row.id,
    userId: row.user_id,
    calendarConnectionId: row.calendar_connection_id,
    googleEventId: row.google_event_id,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: toISO(row.starts_at),
    endsAt: toISO(row.ends_at),
    timeZone: row.timezone,
    isPublic: row.is_public,
    eventStatus: row.event_status,
    syncStatus: row.sync_status,
    providerUpdatedAt: row.provider_updated_at
      ? toISO(row.provider_updated_at)
      : null,
    syncedAt: toISO(row.synced_at),
  };
}

async function executeQuery<T>(
  query: string,
  params: unknown[],
  client?: PoolClient,
): Promise<T[]> {
  if (client) {
    const result = await client.query(query, params);
    return result.rows as T[];
  }

  return (await processReturnQuery(query, params)) as T[];
}

export async function findGoogleCalendarForUser(
  userId: string,
): Promise<GoogleCalendarForUser | null> {
  const rows = await executeQuery<GoogleCalendarRow>(
    `SELECT
       cc.id AS connection_id,
       ea.id AS external_account_id,
       cc.google_calendar_id,
       cc.name AS calendar_name,
       cc.timezone,
       cc.status AS connection_status,
       ea.state AS account_state
     FROM public.calendar_connection cc
     INNER JOIN public.external_account ea
       ON ea.id = cc.external_account_id
     INNER JOIN public."user" u
       ON u.id = ea.user_id
     WHERE ea.user_id = $1
       AND ea.provider = 'google'
       AND u.status = 'active'
       AND u.deleted_at IS NULL
     LIMIT 1`,
    [userId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    connectionId: row.connection_id,
    externalAccountId: row.external_account_id,
    calendarId: row.google_calendar_id,
    calendarName: row.calendar_name,
    timeZone: row.timezone,
    connectionStatus: row.account_state === "active"
      ? row.connection_status
      : "reconnection_required",
  };
}

export async function listCalendarEventMirrors(
  userId: string,
  query: CalendarEventRangeQuery,
  connectionId?: string,
): Promise<CalendarEventMirror[]> {
  const rows = await executeQuery<CalendarEventRow>(
    `SELECT ${eventColumns}
     FROM public.calendar_event
     WHERE user_id = $1
       AND ends_at > $2::timestamptz
       AND starts_at < $3::timestamptz
       AND ($5::uuid IS NULL OR calendar_connection_id = $5::uuid)
     ORDER BY starts_at ASC, id ASC
     LIMIT $4`,
    [userId, query.from, query.to, query.limit, connectionId ?? null],
  );

  return rows.map(mapCalendarEvent);
}

export async function findOwnedCalendarEvent(
  userId: string,
  eventId: string,
  client?: PoolClient,
): Promise<CalendarEventMirror | null> {
  const rows = await executeQuery<CalendarEventRow>(
    `SELECT ${eventColumns}
     FROM public.calendar_event
     WHERE id = $1
       AND user_id = $2
     LIMIT 1`,
    [eventId, userId],
    client,
  );

  return rows[0] ? mapCalendarEvent(rows[0]) : null;
}

export async function upsertCalendarEventMirror(
  input: UpsertCalendarEventMirrorInput,
  client?: PoolClient,
): Promise<CalendarEventMirror> {
  const rows = await executeQuery<CalendarEventRow>(
    `INSERT INTO public.calendar_event (
       user_id,
       calendar_connection_id,
       google_event_id,
       title,
       description,
       location,
       starts_at,
       ends_at,
       timezone,
       is_public,
       event_status,
       sync_status,
       provider_updated_at,
       synced_at
     )
     SELECT
       $1::uuid,
       cc.id,
       $3,
       $4,
       $5,
       $6,
       $7::timestamptz,
       $8::timestamptz,
       $9,
       COALESCE($10::boolean, FALSE),
       $11,
       $12,
       $13::timestamptz,
       NOW()
     FROM public.calendar_connection cc
     INNER JOIN public.external_account ea
       ON ea.id = cc.external_account_id
     INNER JOIN public."user" u
       ON u.id = ea.user_id
     WHERE cc.id = $2::uuid
       AND ea.user_id = $1::uuid
       AND ea.provider = 'google'
       AND u.status = 'active'
       AND u.deleted_at IS NULL
       AND ($14::text IS NULL OR cc.google_calendar_id = $14::text)
     ON CONFLICT (calendar_connection_id, google_event_id)
     DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       location = EXCLUDED.location,
       starts_at = EXCLUDED.starts_at,
       ends_at = EXCLUDED.ends_at,
       timezone = EXCLUDED.timezone,
       is_public = COALESCE($10::boolean, public.calendar_event.is_public),
       event_status = EXCLUDED.event_status,
       sync_status = EXCLUDED.sync_status,
       provider_updated_at = EXCLUDED.provider_updated_at,
       synced_at = NOW(),
       updated_at = NOW()
     WHERE public.calendar_event.user_id = EXCLUDED.user_id
     RETURNING ${eventColumns}`,
    [
      input.userId,
      input.calendarConnectionId,
      input.googleEventId,
      input.title,
      input.description ?? null,
      input.location ?? null,
      input.startsAt,
      input.endsAt,
      input.timeZone,
      input.isPublic ?? null,
      input.eventStatus ?? "confirmed",
      input.syncStatus ?? "synced",
      input.providerUpdatedAt ?? null,
      input.googleCalendarId ?? null,
    ],
    client,
  );

  if (!rows[0]) {
    throw new Error("No se pudo guardar el espejo del evento");
  }

  return mapCalendarEvent(rows[0]);
}

export async function deleteCalendarEventMirror(
  userId: string,
  eventId: string,
  client?: PoolClient,
): Promise<boolean> {
  const rows = await executeQuery<{ id: string }>(
    `DELETE FROM public.calendar_event
     WHERE id = $1
       AND user_id = $2
     RETURNING id`,
    [eventId, userId],
    client,
  );

  return rows.length > 0;
}

export async function findCalendarSyncToken(
  connectionId: string,
  googleCalendarId: string,
): Promise<string | null> {
  const rows = await executeQuery<{ sync_token: string | null }>(
    `SELECT choice.sync_token
     FROM public.calendar_calendar_choice choice
     JOIN public.calendar_connection cc
       ON cc.google_calendar_id = choice.google_calendar_id
     JOIN public.external_account ea
       ON ea.id = cc.external_account_id
     WHERE cc.id = $1
       AND choice.google_calendar_id = $2
       AND choice.user_id = ea.user_id`,
    [connectionId, googleCalendarId],
  );

  return rows[0]?.sync_token ?? null;
}
export async function applyCalendarChanges(
  userId: string,
  connectionId: string,
  googleCalendarId: string,
  upserts: UpsertCalendarEventMirrorInput[],
  deletedIds: string[],
  nextSyncToken: string,
): Promise<void> {
  await processTransaction(async client => {
    const { rows } = await client.query<{ google_calendar_id: string }>(
      `SELECT cc.google_calendar_id
       FROM public.calendar_connection cc
       JOIN public.external_account ea
         ON ea.id = cc.external_account_id
       WHERE cc.id = $1
         AND ea.user_id = $2
         AND ea.provider = 'google'
       FOR UPDATE OF cc`,
      [connectionId, userId],
    );

    if (rows[0]?.google_calendar_id !== googleCalendarId) {
      throw new Error(
        "El calendario seleccionado cambió durante la sincronización",
      );
    }

    for (const input of upserts) {
      await upsertCalendarEventMirror(input, client);
    }

    if (deletedIds.length) {
      await client.query(
        `DELETE FROM public.calendar_event
         WHERE user_id = $1
           AND calendar_connection_id = $2
           AND google_event_id = ANY($3::text[])`,
        [userId, connectionId, deletedIds],
      );
    }

    const updated = await client.query(
      `UPDATE public.calendar_calendar_choice
       SET sync_token = $3,
           last_synced_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1
         AND google_calendar_id = $2
       RETURNING user_id`,
      [userId, googleCalendarId, nextSyncToken],
    );

    if (updated.rowCount !== 1) {
      throw new Error("No se pudo guardar el cursor de sincronización");
    }
  });
}

export async function clearCalendarSyncToken(
  connectionId: string,
  googleCalendarId: string,
): Promise<void> {
  await executeQuery(
    `UPDATE public.calendar_calendar_choice choice
     SET sync_token = NULL,
         updated_at = NOW()
     FROM public.calendar_connection cc
     JOIN public.external_account ea
       ON ea.id = cc.external_account_id
     WHERE cc.id = $1
       AND cc.google_calendar_id = $2
       AND choice.google_calendar_id = $2
       AND choice.user_id = ea.user_id
     RETURNING choice.user_id`,
    [connectionId, googleCalendarId],
  );
}