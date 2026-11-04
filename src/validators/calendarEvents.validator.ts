import { ValidationError } from "../helpers/errors.helper";
import type {
  CalendarEventRangeQuery,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from "../types/calendarEvents.types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const allowedCreateKeys = ["title", "startsAt", "endsAt", "timeZone", "description", "location", "isPublic"] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, context: string): Record<string, unknown> {
  if (!isObject(value)) throw new ValidationError(`${context}: se esperaba un objeto`);
  return value;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) {
    throw new ValidationError("La solicitud contiene campos desconocidos");
  }
}

function validateText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new ValidationError(`${field}: debe contener entre 1 y ${maxLength} caracteres`);
  }
  return value.trim();
}

function validateOptionalText(value: unknown, field: string, maxLength?: number): string {
  if (typeof value !== "string" || (maxLength !== undefined && value.length > maxLength)) {
    throw new ValidationError(`${field}: formato o longitud invalida`);
  }
  return value;
}

function validateTimeZone(value: unknown): string {
  const timeZone = validateText(value, "timeZone", 100);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new ValidationError("timeZone: zona horaria IANA invalida");
  }
  return timeZone;
}

function validateDateTime(value: unknown, field: string): string {
  if (typeof value !== "string") throw new ValidationError(`${field}: se requiere una fecha ISO-8601`);
  const match = isoPattern.exec(value);
  if (!match) throw new ValidationError(`${field}: se requiere ISO-8601 con zona horaria`);

  const [, year, month, day, hour, minute, second, fraction, zone, sign, offsetHour, offsetMinute] = match;
  const numbers = [year, month, day, hour, minute, second].map(Number);
  const [y, mo, d, h, mi, s] = numbers;
  const offsetHours = zone === "Z" ? 0 : Number(offsetHour);
  const offsetMinutes = zone === "Z" ? 0 : Number(offsetMinute);

  if (
    y < 1 || mo < 1 || mo > 12 || d < 1 || d > 31 ||
    h > 23 || mi > 59 || s > 59 ||
    offsetHours > 23 || offsetMinutes > 59
  ) {
    throw new ValidationError(`${field}: fecha u offset invalido`);
  }

  const local = new Date(0);
  local.setUTCFullYear(y, mo - 1, d);
  local.setUTCHours(h, mi, s, fraction ? Number(fraction.padEnd(3, "0")) : 0);

  if (
    local.getUTCFullYear() !== y ||
    local.getUTCMonth() !== mo - 1 ||
    local.getUTCDate() !== d
  ) {
    throw new ValidationError(`${field}: fecha inexistente`);
  }

  const signedOffset = zone === "Z"
    ? 0
    : (sign === "+" ? 1 : -1) * (offsetHours * 60 + offsetMinutes);

  const date = new Date(local.getTime() - signedOffset * 60_000);

  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${field}: fecha invalida`);
  }

  return date.toISOString();
}

function validateDateRange(startsAt: string, endsAt: string): void {
  if (Date.parse(startsAt) >= Date.parse(endsAt)) {
    throw new ValidationError("startsAt debe ser anterior a endsAt");
  }
}

export function validateCalendarEventId(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new ValidationError("eventId: UUID invalido");
  }
  return value.toLowerCase();
}

export function validateCalendarEventRangeQuery(query: unknown): CalendarEventRangeQuery {
  const value = requireObject(query, "query");
  rejectUnknownKeys(value, ["from", "to", "limit"]);

  const now = new Date();
  const from = value.from === undefined
    ? now.toISOString()
    : validateDateTime(value.from, "from");

  const to = value.to === undefined
    ? new Date(now.getTime() + 30 * millisecondsPerDay).toISOString()
    : validateDateTime(value.to, "to");

  if (
    Date.parse(from) >= Date.parse(to) ||
    Date.parse(to) - Date.parse(from) > 90 * millisecondsPerDay
  ) {
    throw new ValidationError("El rango debe ser positivo y no superar 90 dias");
  }

  let limit = 50;

  if (value.limit !== undefined) {
    if (typeof value.limit !== "string" || !/^[1-9]\d*$/.test(value.limit)) {
      throw new ValidationError("limit debe ser un entero entre 1 y 100");
    }

    limit = Number(value.limit);

    if (!Number.isSafeInteger(limit) || limit > 100) {
      throw new ValidationError("limit debe ser un entero entre 1 y 100");
    }
  }

  return { from, to, limit };
}

export function validateCreateCalendarEventBody(body: unknown): CreateCalendarEventInput {
  const value = requireObject(body, "body");
  rejectUnknownKeys(value, allowedCreateKeys);

  const startsAt = validateDateTime(value.startsAt, "startsAt");
  const endsAt = validateDateTime(value.endsAt, "endsAt");
  validateDateRange(startsAt, endsAt);

  const result: CreateCalendarEventInput = {
    title: validateText(value.title, "title", 200),
    startsAt,
    endsAt,
    timeZone: validateTimeZone(value.timeZone),
    isPublic: false,
  };

  if (value.description !== undefined) {
    result.description = validateOptionalText(value.description, "description");
  }

  if (value.location !== undefined) {
    result.location = validateOptionalText(value.location, "location", 300);
  }

  if (value.isPublic !== undefined) {
    if (typeof value.isPublic !== "boolean") {
      throw new ValidationError("isPublic debe ser booleano");
    }
    result.isPublic = value.isPublic;
  }

  return result;
}

export function validateUpdateCalendarEventBody(body: unknown): UpdateCalendarEventInput {
  const value = requireObject(body, "body");
  rejectUnknownKeys(value, allowedCreateKeys);

  if (Object.keys(value).length === 0) {
    throw new ValidationError("PATCH requiere al menos un campo");
  }

  const result: UpdateCalendarEventInput = {};

  if (value.title !== undefined) {
    result.title = validateText(value.title, "title", 200);
  }

  if (value.startsAt !== undefined) {
    result.startsAt = validateDateTime(value.startsAt, "startsAt");
  }

  if (value.endsAt !== undefined) {
    result.endsAt = validateDateTime(value.endsAt, "endsAt");
  }

  if (value.timeZone !== undefined) {
    result.timeZone = validateTimeZone(value.timeZone);
  }

  if (value.description !== undefined) {
    result.description = validateOptionalText(value.description, "description");
  }

  if (value.location !== undefined) {
    result.location = validateOptionalText(value.location, "location", 300);
  }

  if (value.isPublic !== undefined) {
    if (typeof value.isPublic !== "boolean") {
      throw new ValidationError("isPublic debe ser booleano");
    }
    result.isPublic = value.isPublic;
  }

  if (result.startsAt !== undefined && result.endsAt !== undefined) {
    validateDateRange(result.startsAt, result.endsAt);
  }

  return result;
}