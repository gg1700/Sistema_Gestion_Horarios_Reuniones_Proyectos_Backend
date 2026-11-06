import { NotFoundError } from "../helpers/errors.helper";
import * as repository from "../repositories/publicCalendarAvailability.repository";
import type {
  PublicCalendarAvailabilityResponse,
  PublicCalendarAvailabilitySlot,
} from "../types/publicCalendarAvailability.types";

const SLOT_DURATION_MINUTES = 30;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

interface BusyInterval {
  start: number;
  end: number;
}

function parseDate(value: string): DateParts {
  const [year, month, day] = value.split("-").map(Number);

  return { year, month, day };
}

function dateToString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(remainingMinutes).padStart(2, "0")}`;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function localDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
  formatter: Intl.DateTimeFormat,
): Date | null {
  const { year, month, day } = parseDate(date);
  const [hours, minutes] = time.split(":").map(Number);

  const desiredLocalTimestamp = Date.UTC(
    year,
    month - 1,
    day,
    hours,
    minutes,
    0,
  );

  let candidateTimestamp = desiredLocalTimestamp;

  for (let attempt = 0; attempt < 5; attempt++) {
    const parts = formatter.formatToParts(new Date(candidateTimestamp));
    const values: Record<string, string> = {};

    for (const part of parts) {
      if (part.type !== "literal") {
        values[part.type] = part.value;
      }
    }

    const representedTimestamp = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );

    const difference = desiredLocalTimestamp - representedTimestamp;

    candidateTimestamp += difference;

    if (difference === 0) {
      break;
    }
  }

  const verification = formatter.formatToParts(
    new Date(candidateTimestamp),
  );

  const values: Record<string, string> = {};

  for (const part of verification) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const valid =
    Number(values.year) === year &&
    Number(values.month) === month &&
    Number(values.day) === day &&
    Number(values.hour) === hours &&
    Number(values.minute) === minutes;

  return valid ? new Date(candidateTimestamp) : null;
}

function intervalsOverlap(
  start: number,
  end: number,
  busyIntervals: BusyInterval[],
): boolean {
  return busyIntervals.some(
    (interval) => start < interval.end && end > interval.start,
  );
}

export async function getPublicCalendarAvailability(
  handle: string,
  from: string,
  to: string,
): Promise<PublicCalendarAvailabilityResponse> {
  const owner = await repository.findOwnerByHandle(handle);

  if (!owner || !owner.calendar_active) {
    throw new NotFoundError("Calendario público no disponible");
  }

  const timeZone = owner.time_zone || "UTC";

  const rules = await repository.findActiveAvailabilityRules(owner.id);

  if (rules.length === 0) {
    return {
      handleName: owner.handle_name,
      name: owner.name,
      firstSurname: owner.first_surname,
      timeZone,
      slots: [],
    };
  }

  const fromParts = parseDate(from);
  const toParts = parseDate(to);

  const queryFrom = new Date(
    Date.UTC(
      fromParts.year,
      fromParts.month - 1,
      fromParts.day,
    ) - 2 * DAY_IN_MILLISECONDS,
  );

  const queryTo = new Date(
    Date.UTC(
      toParts.year,
      toParts.month - 1,
      toParts.day,
    ) + 2 * DAY_IN_MILLISECONDS,
  );

  const busyRows = await repository.findBusyIntervals(
    owner.id,
    queryFrom,
    queryTo,
  );

  const busyIntervals: BusyInterval[] = busyRows.map((row) => ({
    start: new Date(row.starts_at).getTime(),
    end: new Date(row.ends_at).getTime(),
  }));

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

  const rulesByDay = new Map<number, typeof rules>();

  for (const rule of rules) {
    const current = rulesByDay.get(rule.day_of_week) ?? [];
    current.push(rule);
    rulesByDay.set(rule.day_of_week, current);
  }

  const slots: PublicCalendarAvailabilitySlot[] = [];
  const now = Date.now();

  const cursor = new Date(
    Date.UTC(
      fromParts.year,
      fromParts.month - 1,
      fromParts.day,
    ),
  );

  const endDate = Date.UTC(
    toParts.year,
    toParts.month - 1,
    toParts.day,
  );

  while (cursor.getTime() < endDate) {
    const localDate = dateToString(cursor);
    const dayOfWeek = cursor.getUTCDay();
    const dailyRules = rulesByDay.get(dayOfWeek) ?? [];

    for (const rule of dailyRules) {
      const ruleStart = timeToMinutes(rule.start_time);
      const ruleEnd = timeToMinutes(rule.end_time);

      for (
        let startMinute = ruleStart;
        startMinute + SLOT_DURATION_MINUTES <= ruleEnd;
        startMinute += SLOT_DURATION_MINUTES
      ) {
        const endMinute = startMinute + SLOT_DURATION_MINUTES;

        const startTime = minutesToTime(startMinute);
        const endTime = minutesToTime(endMinute);

        const start = localDateTimeToUtc(
          localDate,
          startTime,
          timeZone,
          formatter,
        );

        const end = localDateTimeToUtc(
          localDate,
          endTime,
          timeZone,
          formatter,
        );

        if (!start || !end) {
          continue;
        }

        const startTimestamp = start.getTime();
        const endTimestamp = end.getTime();

        if (startTimestamp <= now || endTimestamp <= startTimestamp) {
          continue;
        }

        if (
          intervalsOverlap(
            startTimestamp,
            endTimestamp,
            busyIntervals,
          )
        ) {
          continue;
        }

        slots.push({
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
        });
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  slots.sort(
    (first, second) =>
      Date.parse(first.startsAt) - Date.parse(second.startsAt),
  );

  return {
    handleName: owner.handle_name,
    name: owner.name,
    firstSurname: owner.first_surname,
    timeZone,
    slots,
  };
}