import { ValidationError } from "../helpers/errors.helper";
import type { NotificationListFilters } from "../types/notifications.types";

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function positiveInteger(value: unknown, fallback: number, field: string, maximum?: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new ValidationError(`${field} debe ser un entero positivo`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (maximum !== undefined && parsed > maximum)) {
    throw new ValidationError(`${field} fuera del rango permitido`);
  }

  return parsed;
}

export function validateNotificationListQuery(query: Record<string, unknown>): NotificationListFilters {
  if (Object.keys(query).some((key) => !["unreadOnly", "page", "limit"].includes(key))) {
    throw new ValidationError("Parametros de consulta no permitidos");
  }

  const rawUnreadOnly = query.unreadOnly;
  if (rawUnreadOnly !== undefined && rawUnreadOnly !== "true" && rawUnreadOnly !== "false") {
    throw new ValidationError("unreadOnly debe ser true o false");
  }

  const page = positiveInteger(query.page, 1, "page");
  const limit = positiveInteger(query.limit, 20, "limit", 50);
  if (!Number.isSafeInteger((page - 1) * limit)) {
    throw new ValidationError("Pagina fuera del rango permitido");
  }

  return { unreadOnly: rawUnreadOnly === "true", page, limit };
}

export function validateNotificationId(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new ValidationError("Identificador de notificacion invalido");
  }
  return value;
}
