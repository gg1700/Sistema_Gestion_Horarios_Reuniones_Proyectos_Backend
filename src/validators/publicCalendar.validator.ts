import { ValidationError } from "../helpers/errors.helper";
import type { PublicCalendarRange } from "../types/publicCalendar.types";
import { validateCalendarEventRangeQuery } from "./calendarEvents.validator";

export function validatePublicCalendarHandle(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9-]{3,50}$/.test(value)) {
    throw new ValidationError("Identificador de calendario inválido");
  }
  return value;
}

export function validatePublicCalendarRangeQuery(query: Record<string, unknown>): PublicCalendarRange {
  if (Object.keys(query).some(key => key !== "from" && key !== "to")) {
    throw new ValidationError("La consulta contiene parámetros desconocidos");
  }
  const { from, to } = validateCalendarEventRangeQuery(query);
  return { from, to };
}
