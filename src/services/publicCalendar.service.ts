import { NotFoundError, ServerError } from "../helpers/errors.helper";
import * as repository from "../repositories/publicCalendar.repository";
import type {
  PublicCalendarInterval,
  PublicCalendarResponse,
} from "../types/publicCalendar.types";
import { processTransaction } from "../utils/query";
import { GoogleCalendarClientError, listGoogleEvents } from "./googleCalendarClient.service";

const maxEventsInRange = 1000;

export class PublicCalendarUnavailableError extends ServerError {
  constructor() {
    super("La disponibilidad del calendario no está disponible temporalmente", 503);
  }
}

interface Interval {
  start: number;
  end: number;
}

function mergeIntervals(intervals: PublicCalendarInterval[]): Interval[] {
  const ordered = intervals
    .map(({ startsAt, endsAt }) => ({ start: Date.parse(startsAt), end: Date.parse(endsAt) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Interval[] = [];

  for (const interval of ordered) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

export function subtractBusySlots(
  windows: PublicCalendarInterval[],
  busySlots: PublicCalendarInterval[],
): PublicCalendarInterval[] {
  const busy = mergeIntervals(busySlots);
  const available: Interval[] = [];

  for (const window of mergeIntervals(windows)) {
    let cursor = window.start;
    for (const slot of busy) {
      if (slot.end <= cursor) continue;
      if (slot.start >= window.end) break;
      if (slot.start > cursor) available.push({ start: cursor, end: slot.start });
      cursor = Math.max(cursor, slot.end);
      if (cursor >= window.end) break;
    }
    if (cursor < window.end) available.push({ start: cursor, end: window.end });
  }

  return available.map(({ start, end }) => ({
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
  }));
}

export async function getPublicCalendar(
  handle: string,
  from: string,
  to: string,
): Promise<PublicCalendarResponse> {
  const owner = await repository.findActivePublicCalendarByHandle(handle);
  if (!owner) throw new NotFoundError("Calendario no disponible");

  const { userId, connectionId, googleCalendarId } = owner;
  if (!connectionId || !googleCalendarId) throw new PublicCalendarUnavailableError();

  const fromInstant = Date.parse(from);
  const toInstant = Date.parse(to);
  const googleFrom = new Date(Math.floor(fromInstant / 1000) * 1000).toISOString();
  const googleTo = new Date(Math.ceil(toInstant / 1000) * 1000).toISOString();
  const providerEvents = await listGoogleEvents(userId, googleFrom, googleTo, maxEventsInRange + 1, {
    requireComplete: true,
  }).catch(error => {
    if (error instanceof GoogleCalendarClientError) throw new PublicCalendarUnavailableError();
    throw error;
  });
  const currentEvents = providerEvents.filter(event =>
    event.eventStatus !== "cancelled" &&
    Date.parse(event.startsAt) < toInstant && Date.parse(event.endsAt) > fromInstant,
  );
  const googleEventIds = currentEvents.map(event => event.id);
  if (new Set(googleEventIds).size !== googleEventIds.length) {
    throw new PublicCalendarUnavailableError();
  }

  return processTransaction(async client => {
    const currentOwner = await repository.findActivePublicCalendarByHandle(handle, client);
    if (currentOwner?.userId !== userId) throw new NotFoundError("Calendario no disponible");
    if (currentOwner.connectionId !== connectionId || currentOwner.googleCalendarId !== googleCalendarId) {
      throw new PublicCalendarUnavailableError();
    }

    const { handleName, timeZone } = currentOwner;
    let normalizedTimeZone: string;
    try {
      normalizedTimeZone = new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions().timeZone;
    } catch {
      throw new PublicCalendarUnavailableError();
    }

    await repository.refreshEventMirrors(client, userId, connectionId, googleCalendarId, currentEvents);

    const range = { userId, connectionId, from, to, googleEventIds };
    const events = await repository.findPublicEventsInRange(client, range);
    const busySlots = await repository.findAllBusyEventsInRange(client, range);
    const windows = await repository.findAvailabilityRules(client, userId, normalizedTimeZone, range);

    return {
      handleName,
      timeZone,
      from,
      to,
      events,
      busySlots,
      availableWindows: subtractBusySlots(windows, busySlots),
    };
  });
}
