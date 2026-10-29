import type { GoogleCalendar } from "../types/google-calendar.types";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const TIMEOUT_MS = 8000;
const MAX_PAGES = 20;

interface CalendarEntry {
  id?: string;
  summary?: string;
  description?: string;
  timeZone?: string;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
}

interface CalendarListResponse {
  items?: CalendarEntry[];
  nextPageToken?: string;
}

export class GoogleCalendarProviderError extends Error {
  constructor(
    public readonly code: "google_unauthorized" | "google_calendar_unavailable"
  ) {
    super(code);
    this.name = "GoogleCalendarProviderError";
  }
}

export async function fetchGoogleCalendars(
  accessToken: string
): Promise<GoogleCalendar[]> {
  const calendars: GoogleCalendar[] = [];
  const seenPages = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(CALENDAR_API);

    url.searchParams.set("maxResults", "250");
    url.searchParams.set("showHidden", "true");

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error"
      });
    } catch {
      throw new GoogleCalendarProviderError("google_calendar_unavailable");
    }

    if (response.status === 401) {
      throw new GoogleCalendarProviderError("google_unauthorized");
    }

    if (!response.ok) {
      throw new GoogleCalendarProviderError("google_calendar_unavailable");
    }

    let data: CalendarListResponse;

    try {
      data = await response.json() as CalendarListResponse;

      if (!data || !Array.isArray(data.items)) {
        throw new Error("Invalid calendar response");
      }
    } catch {
      throw new GoogleCalendarProviderError("google_calendar_unavailable");
    }

    for (const item of data.items) {
      if (typeof item.id !== "string" || !item.id.trim()) continue;

      const role = item.accessRole ?? "none";

      calendars.push({
        id: item.id,
        name: item.summary ?? item.id,
        description: item.description ?? "",
        timezone: item.timeZone ?? "UTC",
        primary: item.primary === true,
        canWrite: role === "owner" || role === "writer",
        accessRole: role,
        color: item.backgroundColor ?? null
      });
    }

    pageToken = data.nextPageToken;

    if (!pageToken) return calendars;

    if (seenPages.has(pageToken)) {
      throw new GoogleCalendarProviderError("google_calendar_unavailable");
    }

    seenPages.add(pageToken);
  }

  throw new GoogleCalendarProviderError("google_calendar_unavailable");
}

export class GoogleCalendarRevocationError extends Error {
  constructor(public readonly code: "revocation_failed") {
    super(code);
    this.name = "GoogleCalendarRevocationError";
  }
}

export async function revokeGoogleToken(token: string): Promise<void> {
  if (!token.trim()) throw new GoogleCalendarRevocationError("revocation_failed");

  let response: Response;

  try {
    response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(8000),
      redirect: "error"
    });
  } catch {
    throw new GoogleCalendarRevocationError("revocation_failed");
  }

  if (response.ok) return;

  if (response.status === 400) {
    try {
      const data = await response.json() as { error?: string };
      if (data.error === "invalid_token") return;
    } catch {
      throw new GoogleCalendarRevocationError("revocation_failed");
    }
  }

  throw new GoogleCalendarRevocationError("revocation_failed");
}
