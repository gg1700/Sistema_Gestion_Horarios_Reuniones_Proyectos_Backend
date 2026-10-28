import { getValidGoogleAccessToken } from "./google-token.service";
import { fetchGoogleCalendars, GoogleCalendarProviderError, revokeGoogleToken, GoogleCalendarRevocationError } from "./google-calendar-provider.service";
import { findSelectedCalendar, saveSelectedCalendar, findGoogleCalendarConnection, disconnectGoogleCalendar } from "../repositories/google-calendar.repository";
import type { GoogleCalendar, SelectedGoogleCalendar, GoogleCalendarConnectionInfo, GoogleCalendarDisconnectResult } from "../types/google-calendar.types";

export class GoogleCalendarError extends Error {
  constructor(
    public readonly code:
      | "google_not_connected"
      | "reconnection_required"
      | "google_calendar_unavailable"
      | "calendar_not_found"
      | "calendar_read_only"
      | "invalid_calendar_id"
  ) {
    super(code);
    this.name = "GoogleCalendarError";
  }
}

async function getCalendars(userId: string): Promise<GoogleCalendar[]> {
  let accessToken: string;

  try {
    accessToken = await getValidGoogleAccessToken(userId);
  } catch (error) {
    const code = (error as { code?: string }).code;

    if (code === "google_not_connected") {
      throw new GoogleCalendarError("google_not_connected");
    }

    if (code === "reconnection_required") {
      throw new GoogleCalendarError("reconnection_required");
    }

    throw new GoogleCalendarError("google_calendar_unavailable");
  }

  try {
    return await fetchGoogleCalendars(accessToken);
  } catch (error) {
    if (
      error instanceof GoogleCalendarProviderError &&
      error.code === "google_unauthorized"
    ) {
      throw new GoogleCalendarError("reconnection_required");
    }

    throw new GoogleCalendarError("google_calendar_unavailable");
  }
}

export async function listGoogleCalendars(userId: string) {
  const calendars = await getCalendars(userId);
  const selected = await findSelectedCalendar(userId);

  return {
    calendars,
    selectedCalendarId: selected?.google_calendar_id ?? null,
    connectionStatus: selected?.status ?? null
  };
}

export async function selectGoogleCalendar(
  userId: string,
  calendarId: string
): Promise<SelectedGoogleCalendar> {
  if (
    typeof calendarId !== "string" ||
    !calendarId.trim() ||
    calendarId.length > 1024
  ) {
    throw new GoogleCalendarError("invalid_calendar_id");
  }

  const calendars = await getCalendars(userId);

  const calendar = calendars.find(
    (item) => item.id === calendarId
  );

  if (!calendar) {
    throw new GoogleCalendarError("calendar_not_found");
  }

  if (!calendar.canWrite) {
    throw new GoogleCalendarError("calendar_read_only");
  }

  if (calendar.name.trim().length > 150) {
    throw new GoogleCalendarError("invalid_calendar_id");
  }

  try {
    return await saveSelectedCalendar(userId, {
      calendarId: calendar.id,
      calendarName: calendar.name,
      timezone: calendar.timezone,
      status: "connected"
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "reconnection_required"
    ) {
      throw new GoogleCalendarError("reconnection_required");
    }

    throw error;
  }
}

export async function getGoogleCalendarStatus(userId: string): Promise<GoogleCalendarConnectionInfo> {
  const account = await findGoogleCalendarConnection(userId);

  const disconnected: GoogleCalendarConnectionInfo = {
    status: "disconnected",
    calendarId: null,
    calendarName: null,
    reconnectRequired: false
  };

  if (!account) return disconnected;

  const scopes = account.scopes?.split(/\s+/).filter(Boolean) ?? [];
  const hasCalendarScopes =
    scopes.includes("https://www.googleapis.com/auth/calendar.events") &&
    scopes.includes("https://www.googleapis.com/auth/calendar.calendarlist.readonly");

  if (!hasCalendarScopes) return disconnected;

  const reconnectRequired =
    account.state === "revoked" ||
    account.calendar_status === "reconnection_required" ||
    !account.has_refresh_token;

  if (reconnectRequired) {
    return {
      status: "expired",
      calendarId: account.google_calendar_id,
      calendarName: account.calendar_name,
      reconnectRequired: true
    };
  }

  if (account.state !== "active") return disconnected;

  return {
    status: "connected",
    calendarId: account.google_calendar_id,
    calendarName: account.calendar_name,
    reconnectRequired: false
  };
}

export async function unlinkGoogleCalendar(userId: string): Promise<GoogleCalendarDisconnectResult> {
  try {
    await disconnectGoogleCalendar(userId, revokeGoogleToken);
  } catch (error) {
    if (error instanceof GoogleCalendarRevocationError) {
      throw new GoogleCalendarError("google_calendar_unavailable");
    }

    throw error;
  }

  return {
    status: "disconnected",
    message: "Google Calendar desvinculado correctamente"
  };
}