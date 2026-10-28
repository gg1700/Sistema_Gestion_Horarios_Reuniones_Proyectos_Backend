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
