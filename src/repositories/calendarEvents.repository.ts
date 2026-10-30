
import type { PoolClient } from "pg";
import { processReturnQuery } from "../utils/query";
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

/**
 * Obtiene el calendario seleccionado por el usuario.
 * La conexión se valida mediante external_account,
 * sin aceptar identificadores de propietario del cliente HTTP.
 */
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
    connectionStatus:
      row.account_state === "active"
        ? row.connection_status
        : "reconnection_required",
  };
}

/**
 * Lista eventos del espejo local que se superponen
 * con el intervalo solicitado.
 *
 * No realiza llamadas a Google Calendar.
 */
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

/**
 * Busca un evento exclusivamente por ID local y propietario.
 * Un evento ajeno devuelve null, evitando IDOR.
 */
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

/**
 * Inserta o actualiza el espejo de un evento de Google.
 *
 * Conserva is_public cuando no se proporciona explícitamente.
 * El upsert nunca cambia el propietario ni la conexión original.
 * La operación debe ejecutarse después de la operación remota.
 */
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
     ON CONFLICT (calendar_connection_id, google_event_id)
     DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       location = EXCLUDED.location,
       starts_at = EXCLUDED.starts_at,
       ends_at = EXCLUDED.ends_at,
       timezone = EXCLUDED.timezone,
       is_public = COALESCE(
         $10::boolean,
         public.calendar_event.is_public
       ),
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
    ],
    client,
  );

  if (!rows[0]) {
    throw new Error("No se pudo guardar el espejo del evento");
  }

  return mapCalendarEvent(rows[0]);
}

/**
 * Elimina un evento del espejo local.
 *
 * Solo elimina el registro perteneciente al usuario indicado.
 * Debe invocarse después de confirmar la eliminación en Google.
 */
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
