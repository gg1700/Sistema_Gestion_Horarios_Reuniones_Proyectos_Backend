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
const MAX_SYNC_PAGES = 100;

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
  nextSyncToken?: string;
}

export interface GoogleCalendarChanges {
  upserts: GoogleCalendarEvent[];
  deletedIds: string[];
  nextSyncToken: string;
}

export class GoogleCalendarClientError extends ServerError {
  constructor(
    public readonly code:
      | "google_not_connected"
      | "reconnection_required"
      | "google_calendar_unavailable"
      | "google_rate_limited"
      | "google_event_not_found"
      | "google_invalid_response"
      | "google_sync_expired",
    statusCode: number,
  ) {
    super(code, statusCode);
    this.name = "GoogleCalendarClientError";
  }
}

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
    }
    throw new GoogleCalendarClientError("google_calendar_unavailable", 503);
  }
}

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

function buildGoogleUrl(calendarId: string, eventId?: string): URL {
  const base = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
  return new URL(
    eventId === undefined
      ? base
      : `${base}/${encodeURIComponent(eventId)}`,
  );
}

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

async function getGoogleErrorReason(
  response: Response,
): Promise<string | undefined> {
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
      for (const detail of error.errors) {
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
      for (const detail of error.details) {
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

    if ("status" in error && typeof error.status === "string") {
      return error.status;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

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

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function parseGoogleDateTime(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

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

  const values = Object.fromEntries(
    formatter.formatToParts(new Date(instant))
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

function normalizeGoogleEvent(
  event: GoogleEventResource,
  fallbackTimeZone: string,
): GoogleCalendarEvent | null {
  if (typeof event.id !== "string" || !event.id.trim()) return null;

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

      if (event) events.push(event);
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

export async function createGoogleEvent(
  userId: string,
  input: CreateCalendarEventInput,
): Promise<GoogleCalendarEvent> {
  const calendar = await getSelectedCalendar(userId);
  const accessToken = await getValidGoogleAccessToken(userId);

  const response = await requestGoogle<GoogleEventResource>(
    accessToken,
    buildGoogleUrl(calendar.calendarId),
    "POST",
    makeGoogleEventBody(input),
  );

  return requireGoogleEvent(response, input.timeZone);
}

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

  return requireGoogleEvent(
    response,
    input.timeZone ?? calendar.timeZone ?? "UTC",
  );
}

export async function deleteGoogleEvent(
  userId: string,
  googleEventId: string,
): Promise<void> {
  const calendar = await getSelectedCalendar(userId);
  const accessToken = await getValidGoogleAccessToken(userId);

  await requestGoogle<void>(
    accessToken,
    buildGoogleUrl(calendar.calendarId, googleEventId),
    "DELETE",
    undefined,
    true,
  );
}

/**
 * Obtiene todos los cambios desde el syncToken anterior.
 * La primera llamada, sin syncToken, realiza una sincronización inicial.
 */
export async function listGoogleCalendarChanges(
  userId: string,
  syncToken?: string,
): Promise<GoogleCalendarChanges> {
  const calendar = await getSelectedCalendar(userId);
  const accessToken = await getValidGoogleAccessToken(userId);

  const upserts: GoogleCalendarEvent[] = [];
  const deletedIds: string[] = [];
  const visitedTokens = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_SYNC_PAGES; page++) {
    const url = buildGoogleUrl(calendar.calendarId);
    url.searchParams.set("maxResults", "2500");
    url.searchParams.set("showDeleted", "true");

    if (syncToken) url.searchParams.set("syncToken", syncToken);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    let response: Response;

    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
      });
    } catch {
      throw new GoogleCalendarClientError(
        "google_calendar_unavailable",
        503,
      );
    }

    if (response.status === 410 && syncToken) {
      throw new GoogleCalendarClientError("google_sync_expired", 409);
    }

    if (!response.ok) {
      const reason = response.status === 403
        ? await getGoogleErrorReason(response)
        : undefined;

      parseRemoteError(response.status, false, reason);
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new GoogleCalendarClientError("google_invalid_response", 502);
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      !("items" in payload) ||
      !Array.isArray(payload.items)
    ) {
      throw new GoogleCalendarClientError("google_invalid_response", 502);
    }

    const data = payload as GoogleEventListResponse;

    for (const item of data.items ?? []) {
      if (item?.status === "cancelled") {
        if (typeof item.id === "string" && item.id) {
          deletedIds.push(item.id);
        }
        continue;
      }

      const event = normalizeGoogleEvent(
        item,
        calendar.timeZone ?? "UTC",
      );

      if (event) upserts.push(event);
    }

    if (!data.nextPageToken) {
      if (
        typeof data.nextSyncToken !== "string" ||
        !data.nextSyncToken
      ) {
        throw new GoogleCalendarClientError("google_invalid_response", 502);
      }

      return {
        upserts,
        deletedIds,
        nextSyncToken: data.nextSyncToken,
      };
    }

    if (visitedTokens.has(data.nextPageToken)) {
      throw new GoogleCalendarClientError("google_invalid_response", 502);
    }

    visitedTokens.add(data.nextPageToken);
    pageToken = data.nextPageToken;
  }

  throw new GoogleCalendarClientError("google_invalid_response", 502);
}
