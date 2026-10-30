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
type CalendarRequestMethod = "GET" | "POST" | "PATCH" | "DELETE";

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
 * Reutiliza el servicio existente de tokens.
 * No descifra, almacena ni renueva tokens directamente.
 */
export async function getValidGoogleAccessToken(
  userId: string,
): Promise<string> {
  try {
    return await getValidGoogleAccessTokenService(userId);
  } catch (error) {
    if (error instanceof GoogleTokenError) {
      if (error.code === "google_not_connected") {
        throw new GoogleCalendarClientError("google_not_connected", 409);
      }

      if (error.code === "reconnection_required") {
        throw new GoogleCalendarClientError("reconnection_required", 409);
      }

      if (error.code === "google_refresh_failed") {
        throw new GoogleCalendarClientError("google_calendar_unavailable", 503);
      }
    }

    throw new GoogleCalendarClientError("google_calendar_unavailable", 503);
  }
}

/**
 * Obtiene exclusivamente el calendario seleccionado
 * por el usuario autenticado.
 */
async function getSelectedCalendar(
  userId: string,
): Promise<GoogleCalendarForUser> {
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

/**
 * Codifica los identificadores para construir URLs seguras.
 */
function buildGoogleUrl(calendarId: string, eventId?: string): URL {
  const encodedCalendarId = encodeURIComponent(calendarId);
  const base = `${GOOGLE_CALENDAR_API}/calendars/${encodedCalendarId}/events`;

  return new URL(
    eventId === undefined
      ? base
      : `${base}/${encodeURIComponent(eventId)}`,
  );
}

/**
 * Traduce los errores HTTP de Google a errores controlados.
 */
function parseRemoteError(
  status: number,
  eventOperation: boolean,
  reason?: string,
): never {
  if (status === 401) {
    throw new GoogleCalendarClientError("reconnection_required", 409);
  }

  if (status === 403) {
    if (
      reason === "rateLimitExceeded" ||
      reason === "userRateLimitExceeded" ||
      reason === "quotaExceeded"
    ) {
      throw new GoogleCalendarClientError("google_rate_limited", 429);
    }

    if (
      reason === "insufficientPermissions" ||
      reason === "insufficientAuthenticationScopes" ||
      reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT"
    ) {
      throw new GoogleCalendarClientError("reconnection_required", 409);
    }

    throw new GoogleCalendarClientError("google_calendar_unavailable", 502);
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
 * Extrae el motivo de un error de Google sin exponer
 * datos sensibles ni registrar el cuerpo de respuesta.
 */
async function getGoogleErrorReason(response: Response): Promise<string | undefined> {
  try {
    const data: unknown = await response.json();

    if (!data || typeof data !== "object" || !("error" in data)) {
      return undefined;
    }

    const error = data.error;

    if (!error || typeof error !== "object") {
      return undefined;
    }

    if ("errors" in error && Array.isArray(error.errors)) {
      const details: unknown[] = error.errors;

      for (const detail of details) {
        if (
          detail &&
          typeof detail === "object" &&
          "reason" in detail &&
          typeof detail.reason === "string"
        ) {
          return detail.reason;
        }
      }
    }

    if ("details" in error && Array.isArray(error.details)) {
      const details: unknown[] = error.details;

      for (const detail of details) {
        if (
          detail &&
          typeof detail === "object" &&
          "reason" in detail &&
          typeof detail.reason === "string"
        ) {
          return detail.reason;
        }

        if (
          detail &&
          typeof detail === "object" &&
          "metadata" in detail &&
          detail.metadata &&
          typeof detail.metadata === "object" &&
          "reason" in detail.metadata &&
          typeof detail.metadata.reason === "string"
        ) {
          return detail.metadata.reason;
        }
      }
    }

    if ("status" in error && typeof error.status === "string") {
      return error.status;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Ejecuta una petición HTTP contra Google Calendar.
 * Aplica timeout y traduce respuestas de error.
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
        ...(body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(body !== undefined
        ? { body: JSON.stringify(body) }
        : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
  } catch {
    throw new GoogleCalendarClientError(
      "google_calendar_unavailable",
      503,
    );
  }

  if (!response.ok) {
    const reason = response.status === 403
      ? await getGoogleErrorReason(response)
      : undefined;

    parseRemoteError(response.status, eventOperation, reason);
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

/**
 * Comprueba una zona horaria IANA.
 */
function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convierte fechas ISO-8601 remotas sin lanzar RangeError.
 */
function parseGoogleDateTime(value: string): string | null {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

/**
 * Convierte la medianoche local de un evento de día completo
 * al instante UTC correspondiente.
 *
 * Google representa el fin de los eventos de día completo
 * como una fecha exclusiva.
 */
function allDayToISO(date: string, timeZone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidTimeZone(timeZone)) {
    return null;
  }

  const [year, month, day] = date.split("-").map(Number);
  const midnightUTC = Date.UTC(year, month - 1, day);

  if (!Number.isFinite(midnightUTC)) return null;

  const check = new Date(midnightUTC);

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  let instant = midnightUTC;

  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instant))
        .filter(part => part.type !== "literal")
        .map(part => [part.type, Number(part.value)]),
    );

    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );

    const difference = midnightUTC - represented;

    if (difference === 0) {
      return new Date(instant).toISOString();
    }

    instant += difference;
  }

  const finalParts = formatter.formatToParts(new Date(instant));

  const values = Object.fromEntries(
    finalParts
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)]),
  );

  if (
    values.year !== year ||
    values.month !== month ||
    values.day !== day ||
    values.hour !== 0 ||
    values.minute !== 0
  ) {
    return null;
  }

  return new Date(instant).toISOString();
}

/**
 * Normaliza los eventos temporizados y de día completo
 * a la representación interna de Orbitia.
 */
function normalizeGoogleEvent(
  event: GoogleEventResource,
  fallbackTimeZone: string,
): GoogleCalendarEvent | null {
  if (typeof event.id !== "string" || !event.id.trim()) {
    return null;
  }

  const timeZone =
    event.start?.timeZone ??
    event.end?.timeZone ??
    fallbackTimeZone;

  if (!isValidTimeZone(timeZone)) return null;

  const startsAt = event.start?.dateTime
    ? parseGoogleDateTime(event.start.dateTime)
    : event.start?.date
      ? allDayToISO(event.start.date, timeZone)
      : null;

  const endsAt = event.end?.dateTime
    ? parseGoogleDateTime(event.end.dateTime)
    : event.end?.date
      ? allDayToISO(event.end.date, timeZone)
      : null;

  if (
    !startsAt ||
    !endsAt ||
    Date.parse(startsAt) >= Date.parse(endsAt)
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
    startsAt,
    endsAt,
    timeZone,
    eventStatus,
    providerUpdatedAt: event.updated ?? null,
  };
}

/**
 * Requiere que Google devuelva un evento utilizable.
 */
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

/**
 * Construye el cuerpo de creación para Google Calendar v3.
 * isPublic se administra únicamente en PostgreSQL.
 */
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
 * Soporta paginación, eventos recurrentes expandidos
 * y eventos de día completo.
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

  for (
    let page = 0;
    page < MAX_PAGES && events.length < limit;
    page++
  ) {
    const url = buildGoogleUrl(calendar.calendarId);

    url.searchParams.set("timeMin", from);
    url.searchParams.set("timeMax", to);
    url.searchParams.set("maxResults", String(Math.min(250, limit)));
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await requestGoogle<GoogleEventListResponse>(
      accessToken,
      url,
      "GET",
    );

    if (!response || !Array.isArray(response.items)) {
      throw new GoogleCalendarClientError("google_invalid_response", 502);
    }

    for (const item of response.items) {
      const event = normalizeGoogleEvent(
        item,
        calendar.timeZone ?? "UTC",
      );

      if (event) {
        events.push(event);
      }

      if (events.length >= limit) break;
    }

    pageToken = response.nextPageToken;

    if (!pageToken || events.length >= limit) {
      return events;
    }

    if (visitedTokens.has(pageToken)) {
      throw new GoogleCalendarClientError("google_invalid_response", 502);
    }

    visitedTokens.add(pageToken);
  }

  if (pageToken && events.length < limit) {
    throw new GoogleCalendarClientError("google_invalid_response", 502);
  }

  return events;
}

/**
 * Crea el evento en Google Calendar.
 * La persistencia del espejo local corresponde al servicio
 * calendarEvents.service.ts.
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
 * La comprobación de propiedad del UUID local corresponde
 * al servicio calendarEvents.service.ts.
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

  if (input.title !== undefined) {
    body.summary = input.title;
  }

  if (input.description !== undefined) {
    body.description = input.description;
  }

  if (input.location !== undefined) {
    body.location = input.location;
  }

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

  return requireGoogleEvent(
    response,
    input.timeZone ?? calendar.timeZone ?? "UTC",
  );
}

/**
 * Elimina el evento remoto.
 * El espejo local se elimina únicamente después
 * de una respuesta exitosa de Google.
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
