import { ServerError } from "../helpers/errors.helper";
import { findGoogleCalendarForUser } from "../repositories/calendarEvents.repository";
import {
  getValidGoogleAccessToken as getValidGoogleAccessTokenService,
  GoogleTokenError,
} from "./google-token.service";
import type {
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
  GoogleCalendarEvent,
  GoogleCalendarForUser,
  CalendarEventStatus,
} from "../types/calendarEvents.types";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const TIMEOUT_MS = 8000;
const MAX_PAGES = 20;

type GoogleEventStatus = "confirmed" | "tentative" | "cancelled";

interface GoogleEventDate {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

interface GoogleEventResource {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleEventDate;
  end?: GoogleEventDate;
  status?: GoogleEventStatus;
  updated?: string;
}

interface GoogleEventListResponse {
  items?: GoogleEventResource[];
  nextPageToken?: string;
}

type CalendarRequestMethod = "GET" | "POST" | "PATCH" | "DELETE";

export class GoogleCalendarClientError extends ServerError {
  constructor(
    public readonly code:
      | "google_not_connected"
      | "reconnection_required"
      | "google_calendar_unavailable"
      | "google_rate_limited"
      | "google_event_not_found"
      | "google_invalid_response",
    statusCode: number,
  ) {
    super(code, statusCode);
    this.name = "GoogleCalendarClientError";
  }
}

/**
 * Reutiliza la renovación y el descifrado de tokens del Sprint 1.
 */
export async function getValidGoogleAccessToken(userId: string): Promise<string> {
  try {
    return await getValidGoogleAccessTokenFromService(userId);
  } catch (error) {
    if (error instanceof GoogleTokenError) {
      if (error.code === "google_not_connected") {
        throw new GoogleCalendarClientError("google_not_connected", 409);
      }

      if (error.code === "reconnection_required") {
        throw new GoogleCalendarClientError("reconnection_required", 409);
      }
    }

    throw new GoogleCalendarClientError("google_calendar_unavailable", 503);
  }
}

async function getValidGoogleAccessTokenFromService(userId: string): Promise<string> {
  return getValidGoogleAccessTokenService(userId);
}

async function getSelectedCalendar(userId: string): Promise<GoogleCalendarForUser> {
  const calendar = await findGoogleCalendarForUser(userId);

  if (!calendar) {
    throw new GoogleCalendarClientError("google_not_connected", 409);
  }

  if (calendar.connectionStatus !== "connected") {
    throw new GoogleCalendarClientError("reconnection_required", 409);
  }

  if (!calendar.calendarId?.trim()) {
    throw new GoogleCalendarClientError("google_not_connected", 409);
  }

  return calendar;
}

function buildGoogleUrl(calendarId: string, eventId?: string): URL {
  const encodedCalendarId = encodeURIComponent(calendarId);
  const base = `${GOOGLE_CALENDAR_API}/calendars/${encodedCalendarId}/events`;

  return new URL(eventId === undefined ? base : `${base}/${encodeURIComponent(eventId)}`);
}

function parseRemoteError(status: number, eventOperation: boolean): never {
  if (status === 401) {
    throw new GoogleCalendarClientError("reconnection_required", 409);
  }

  if (status === 403) {
    throw new GoogleCalendarClientError("reconnection_required", 409);
  }

  if (status === 404) {
    throw new GoogleCalendarClientError(
      eventOperation ? "google_event_not_found" : "google_not_connected",
      eventOperation ? 404 : 409,
    );
  }

  if (status === 409 || status === 412) {
    throw new GoogleCalendarClientError("google_calendar_unavailable", 409);
  }

  if (status === 429) {
    throw new GoogleCalendarClientError("google_rate_limited", 429);
  }

  throw new GoogleCalendarClientError(
    "google_calendar_unavailable",
    status >= 500 ? 503 : 502,
  );
}

/**
 * Todas las llamadas al proveedor tienen timeout.
 * Nunca registra tokens, respuestas remotas ni secretos.
 */
async function requestGoogle<T>(
  accessToken: string,
  url: URL,
  method: CalendarRequestMethod,
  body?: object,
  eventOperation = false,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
  } catch {
    throw new GoogleCalendarClientError("google_calendar_unavailable", 503);
  }

  if (!response.ok) {
    parseRemoteError(response.status, eventOperation);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new GoogleCalendarClientError("google_invalid_response", 502);
  }
}

function normalizeGoogleEvent(
  event: GoogleEventResource,
  fallbackTimeZone: string,
): GoogleCalendarEvent | null {
  if (typeof event.id !== "string" || !event.id.trim()) return null;

  // Los eventos sin horas completas se tratan de manera independiente
  // para evitar asignarles una hora incorrecta.
  if (!event.start?.dateTime || !event.end?.dateTime) return null;

  const startsAt = new Date(event.start.dateTime);
  const endsAt = new Date(event.end.dateTime);

  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    startsAt >= endsAt
  ) {
    return null;
  }

  const allowedStatuses: CalendarEventStatus[] = [
    "confirmed",
    "tentative",
    "cancelled",
  ];

  const eventStatus: CalendarEventStatus =
    event.status && allowedStatuses.includes(event.status)
      ? event.status
      : "confirmed";

  return {
    id: event.id,
    title: event.summary ?? "(Sin título)",
    description: event.description ?? null,
    location: event.location ?? null,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timeZone: event.start.timeZone ?? fallbackTimeZone,
    eventStatus,
    providerUpdatedAt: event.updated ?? null,
  };
}

function requireGoogleEvent(
  event: GoogleEventResource,
  timeZone: string,
): GoogleCalendarEvent {
  const normalized = normalizeGoogleEvent(event, timeZone);

  if (!normalized) {
    throw new GoogleCalendarClientError("google_invalid_response", 502);
  }

  return normalized;
}

function makeGoogleEventBody(input: CreateCalendarEventInput): object {
  return {
    summary: input.title,
    description: input.description,
    location: input.location,
    start: {
      dateTime: input.startsAt,
      timeZone: input.timeZone,
    },
    end: {
      dateTime: input.endsAt,
      timeZone: input.timeZone,
    },
  };
}

/**
 * Consulta los eventos del calendario seleccionado.
 *
 * Google es la fuente primaria.
 * No consulta ni modifica el espejo PostgreSQL.
 */
export async function listGoogleEvents(
  userId: string,
  from: string,
  to: string,
  limit = 50,
): Promise<GoogleCalendarEvent[]> {
  const calendar = await getSelectedCalendar(userId);
  const accessToken = await getValidGoogleAccessToken(userId);
  const events: GoogleCalendarEvent[] = [];
  const visitedTokens = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES && events.length < limit; page++) {
    const url = buildGoogleUrl(calendar.calendarId);
    url.searchParams.set("timeMin", from);
    url.searchParams.set("timeMax", to);
    url.searchParams.set("maxResults", String(Math.min(250, limit)));
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");

    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await requestGoogle<GoogleEventListResponse>(
      accessToken,
      url,
      "GET",
    );

    if (!response || !Array.isArray(response.items)) {
      throw new GoogleCalendarClientError("google_invalid_response", 502);
    }

    for (const item of response.items) {
      const event = normalizeGoogleEvent(item, calendar.timeZone ?? "UTC");
      if (event) events.push(event);
      if (events.length >= limit) break;
    }

    pageToken = response.nextPageToken;
    if (!pageToken) return events;

    if (visitedTokens.has(pageToken)) {
      throw new GoogleCalendarClientError("google_invalid_response", 502);
    }

    visitedTokens.add(pageToken);
  }

  return events;
}

/**
 * Crea el evento en el calendario remoto.
 * La persistencia local corresponde a calendarEvents.service.ts.
 */
export async function createGoogleEvent(
  userId: string,
  input: CreateCalendarEventInput,
): Promise<GoogleCalendarEvent> {
  const calendar = await getSelectedCalendar(userId);
  const accessToken = await getValidGoogleAccessToken(userId);
  const url = buildGoogleUrl(calendar.calendarId);

  const response = await requestGoogle<GoogleEventResource>(
    accessToken,
    url,
    "POST",
    makeGoogleEventBody(input),
  );

  return requireGoogleEvent(response, input.timeZone);
}

/**
 * Actualiza parcialmente un evento remoto.
 * El servicio de negocio debe comprobar antes la propiedad
 * del evento mediante su UUID local.
 */
export async function updateGoogleEvent(
  userId: string,
  googleEventId: string,
  input: UpdateCalendarEventInput,
): Promise<GoogleCalendarEvent> {
  const calendar = await getSelectedCalendar(userId);
  const accessToken = await getValidGoogleAccessToken(userId);
  const url = buildGoogleUrl(calendar.calendarId, googleEventId);

  const body: Record<string, unknown> = {};

  if (input.title !== undefined) body.summary = input.title;
  if (input.description !== undefined) body.description = input.description;
  if (input.location !== undefined) body.location = input.location;

  if (input.startsAt !== undefined) {
    body.start = {
      dateTime: input.startsAt,
      timeZone: input.timeZone ?? calendar.timeZone ?? "UTC",
    };
  }

  if (input.endsAt !== undefined) {
    body.end = {
      dateTime: input.endsAt,
      timeZone: input.timeZone ?? calendar.timeZone ?? "UTC",
    };
  }

  const response = await requestGoogle<GoogleEventResource>(
    accessToken,
    url,
    "PATCH",
    body,
    true,
  );

  return requireGoogleEvent(response, input.timeZone ?? calendar.timeZone ?? "UTC");
}

/**
 * Elimina un evento remoto.
 *
 * Debe invocarse exclusivamente después de comprobar
 * que el UUID local pertenece al usuario autenticado.
 */
export async function deleteGoogleEvent(
  userId: string,
  googleEventId: string,
): Promise<void> {
  const calendar = await getSelectedCalendar(userId);
  const accessToken = await getValidGoogleAccessToken(userId);
  const url = buildGoogleUrl(calendar.calendarId, googleEventId);

  await requestGoogle<void>(
    accessToken,
    url,
    "DELETE",
    undefined,
    true,
  );
}
