import { NotFoundError } from "../helpers/errors.helper";
import * as repository from "../repositories/notifications.repository";
import type {
  NotificationItem,
  NotificationListFilters,
  NotificationListResult,
  NotificationReadResult,
  NotificationRow,
} from "../types/notifications.types";

function toIsoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function publicPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const source = value as Record<string, unknown>;
  const safeFields = ["meetingRequestId", "requestId", "meeting_request_id", "request_id", "status", "action"];
  const result: Record<string, unknown> = {};

  for (const field of safeFields) {
    const item = source[field];
    if (typeof item === "string" && item.length <= 150) {
      result[field] = item;
    }
  }

  return result;
}

function toNotificationItem(row: NotificationRow): NotificationItem {
  return {
    id: row.id,
    type: row.notification_type,
    title: row.title,
    message: row.message,
    payload: publicPayload(row.payload),
    createdAt: toIsoDate(row.created_at),
    readAt: row.read_at === null ? null : toIsoDate(row.read_at),
  };
}

export async function listNotifications(
  userId: string,
  filters: NotificationListFilters,
): Promise<NotificationListResult> {
  const [rows, total, unreadCount] = await Promise.all([
    repository.listUserNotifications(userId, filters),
    repository.countUserNotifications(userId, filters.unreadOnly),
    repository.countUnreadNotifications(userId),
  ]);

  return {
    items: rows.map(toNotificationItem),
    page: filters.page,
    limit: filters.limit,
    total,
    unreadCount,
  };
}

export async function markNotificationAsRead(
  userId: string,
  notificationId: string,
): Promise<NotificationReadResult> {
  const updated = await repository.markOwnedNotificationAsRead(userId, notificationId);
  if (!updated) throw new NotFoundError("Notificacion no encontrada");

  return { id: updated.id, readAt: toIsoDate(updated.read_at) };
}
