export type CalendarEventStatus = "confirmed" | "tentative" | "cancelled";
export type CalendarEventSyncStatus = "synced" | "pending_sync" | "sync_error";

export type CalendarEventDateTime = string;

export interface CalendarEventRangeQuery {
  from: CalendarEventDateTime;
  to: CalendarEventDateTime;
  limit: number;
}

export interface CreateCalendarEventInput {
  title: string;
  startsAt: CalendarEventDateTime;
  endsAt: CalendarEventDateTime;
  timeZone: string;
  description?: string;
  location?: string;
  isPublic: boolean;
}

export type UpdateCalendarEventInput = Partial<Omit<CreateCalendarEventInput, "isPublic">> & {
  isPublic?: boolean;
};

export interface CalendarEventResponse {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: CalendarEventDateTime;
  endsAt: CalendarEventDateTime;
  timeZone: string;
  isPublic: boolean;
  eventStatus: CalendarEventStatus;
  syncStatus: CalendarEventSyncStatus;
}

/** Representación interna de calendar_event en PostgreSQL. */
export interface CalendarEventMirror extends CalendarEventResponse {
  userId: string;
  calendarConnectionId: string;
  googleEventId: string;
  providerUpdatedAt: CalendarEventDateTime | null;
  syncedAt: CalendarEventDateTime;
}

export interface GoogleCalendarForUser {
  connectionId: string;
  calendarId: string;
  calendarName: string | null;
  timeZone: string | null;
  connectionStatus: string;
  externalAccountId: string;
}

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: CalendarEventDateTime;
  endsAt: CalendarEventDateTime;
  timeZone: string;
  eventStatus: CalendarEventStatus;
  providerUpdatedAt: CalendarEventDateTime | null;
}
