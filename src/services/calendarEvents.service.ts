
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../helpers/errors.helper";
import {
  findGoogleCalendarForUser,
  findOwnedCalendarEvent,
  upsertCalendarEventMirror,
  deleteCalendarEventMirror,
  findCalendarSyncToken,
  applyCalendarChanges,
  clearCalendarSyncToken,
} from "../repositories/calendarEvents.repository";
import {
  listGoogleEvents,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  listGoogleCalendarChanges,
  GoogleCalendarClientError,
} from "./googleCalendarClient.service";
import type {
  CalendarEventMirror,
  CalendarEventRangeQuery,
  CalendarEventResponse,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
  GoogleCalendarEvent,
  GoogleCalendarForUser,
} from "../types/calendarEvents.types";

function toResponse(event: CalendarEventMirror): CalendarEventResponse {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timeZone: event.timeZone,
    isPublic: event.isPublic,
    eventStatus: event.eventStatus,
    syncStatus: event.syncStatus,
  };
}

function ensureConnected(
  calendar: GoogleCalendarForUser | null,
): GoogleCalendarForUser {
  if (!calendar) {
    throw new ConflictError("Google Calendar no está conectado");
  }

  if (
    calendar.connectionStatus !== "connected" ||
    !calendar.calendarId?.trim()
  ) {
    throw new ConflictError(
      "Google Calendar requiere una nueva autorización",
    );
  }

  return calendar;
}

async function getConnectedCalendar(
  userId: string,
): Promise<GoogleCalendarForUser> {
  return ensureConnected(await findGoogleCalendarForUser(userId));
}

async function getOwnedEvent(
  userId: string,
  eventId: string,
  connectionId: string,
): Promise<CalendarEventMirror> {
  const event = await findOwnedCalendarEvent(userId, eventId);

  if (!event || event.calendarConnectionId !== connectionId) {
    throw new NotFoundError("Evento no encontrado");
  }

  return event;
}

function ensureValidRange(startsAt: string, endsAt: string): void {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end
  ) {
    throw new ValidationError("startsAt debe ser anterior a endsAt");
  }
}

function hasGoogleChanges(input: UpdateCalendarEventInput): boolean {
  return (
    input.title !== undefined ||
    input.description !== undefined ||
    input.location !== undefined ||
    input.startsAt !== undefined ||
    input.endsAt !== undefined ||
    input.timeZone !== undefined
  );
}

function mirrorData(
  userId: string,
  connectionId: string,
  event: GoogleCalendarEvent,
  isPublic?: boolean,
  calendarId?: string,
) {
  return {
    userId,
    calendarConnectionId: connectionId,
    googleEventId: event.id,
    ...(calendarId !== undefined ? { googleCalendarId: calendarId } : {}),
    title: event.title,
    description: event.description,
    location: event.location,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timeZone: event.timeZone,
    ...(isPublic !== undefined ? { isPublic } : {}),
    eventStatus: event.eventStatus,
    syncStatus: "synced" as const,
    providerUpdatedAt: event.providerUpdatedAt,
  };
}

async function retryLocalOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch {
    return operation();
  }
}

async function syncExternalChanges(
  userId: string,
  calendar: GoogleCalendarForUser,
): Promise<void> {
  const syncToken = await findCalendarSyncToken(
    calendar.connectionId,
    calendar.calendarId,
  );

  let changes;

  try {
    changes = await listGoogleCalendarChanges(
      userId,
      syncToken ?? undefined,
    );
  } catch (error) {
    if (
      syncToken &&
      error instanceof GoogleCalendarClientError &&
      error.code === "google_sync_expired"
    ) {
      await clearCalendarSyncToken(
        calendar.connectionId,
        calendar.calendarId,
      );

      changes = await listGoogleCalendarChanges(userId);
    } else {
      throw error;
    }
  }

  await applyCalendarChanges(
    userId,
    calendar.connectionId,
    calendar.calendarId,
    changes.upserts.map(event =>
      mirrorData(
        userId,
        calendar.connectionId,
        event,
        undefined,
        calendar.calendarId,
      ),
    ),
    changes.deletedIds,
    changes.nextSyncToken,
  );
}

export async function listCalendarEvents(
  userId: string,
  query: CalendarEventRangeQuery,
): Promise<CalendarEventResponse[]> {
  const calendar = await getConnectedCalendar(userId);

  await syncExternalChanges(userId, calendar);

  const googleEvents = await listGoogleEvents(
    userId,
    query.from,
    query.to,
    query.limit,
  );

  const events: CalendarEventResponse[] = [];

  for (const googleEvent of googleEvents) {
    const mirror = await upsertCalendarEventMirror(
      mirrorData(
        userId,
        calendar.connectionId,
        googleEvent,
        undefined,
        calendar.calendarId,
      ),
    );

    events.push(toResponse(mirror));
  }

  return events;
}

export async function createCalendarEvent(
  userId: string,
  input: CreateCalendarEventInput,
): Promise<CalendarEventResponse> {
  const calendar = await getConnectedCalendar(userId);

  ensureValidRange(input.startsAt, input.endsAt);

  const googleEvent = await createGoogleEvent(userId, input);

  try {
    const mirror = await upsertCalendarEventMirror(
      mirrorData(
        userId,
        calendar.connectionId,
        googleEvent,
        input.isPublic,
        calendar.calendarId,
      ),
    );

    return toResponse(mirror);
  } catch (error) {
    try {
      await deleteGoogleEvent(userId, googleEvent.id);
    } catch {
      // La compensación es de mejor esfuerzo.
      // Se conserva el error original.
    }

    throw error;
  }
}

export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  input: UpdateCalendarEventInput,
): Promise<CalendarEventResponse> {
  const calendar = await getConnectedCalendar(userId);

  const current = await getOwnedEvent(
    userId,
    eventId,
    calendar.connectionId,
  );

  const startsAt = input.startsAt ?? current.startsAt;
  const endsAt = input.endsAt ?? current.endsAt;
  ensureValidRange(startsAt, endsAt);

  let updated: GoogleCalendarEvent;

  if (hasGoogleChanges(input)) {
    const updateInput: UpdateCalendarEventInput = { ...input };

    if (
      input.startsAt !== undefined ||
      input.endsAt !== undefined ||
      input.timeZone !== undefined
    ) {
      updateInput.startsAt = startsAt;
      updateInput.endsAt = endsAt;
      updateInput.timeZone = input.timeZone ?? current.timeZone;
    }

    updated = await updateGoogleEvent(
      userId,
      current.googleEventId,
      updateInput,
    );
  } else {
    updated = {
      id: current.googleEventId,
      title: current.title,
      description: current.description,
      location: current.location,
      startsAt: current.startsAt,
      endsAt: current.endsAt,
      timeZone: current.timeZone,
      eventStatus: current.eventStatus,
      providerUpdatedAt: current.providerUpdatedAt,
    };
  }

  const mirror = await retryLocalOperation(() =>
    upsertCalendarEventMirror(
      mirrorData(
        userId,
        calendar.connectionId,
        updated,
        input.isPublic ?? current.isPublic,
        calendar.calendarId,
      ),
    ),
  );

  return toResponse(mirror);
}

export async function deleteCalendarEvent(
  userId: string,
  eventId: string,
): Promise<void> {
  const calendar = await getConnectedCalendar(userId);
  const current = await getOwnedEvent(
    userId,
    eventId,
    calendar.connectionId,
  );

  await deleteGoogleEvent(userId, current.googleEventId);

  const deleted = await retryLocalOperation(() =>
    deleteCalendarEventMirror(userId, eventId),
  );

  if (!deleted) {
    throw new ConflictError(
      "El espejo local del evento ya no existe",
    );
  }
}