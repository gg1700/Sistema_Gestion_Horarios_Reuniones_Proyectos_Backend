import { processReturnQuery } from "../utils/query";
import type {
  NotificationListFilters,
  NotificationReadRow,
  NotificationRow,
} from "../types/notifications.types";

export async function listUserNotifications(
  userId: string,
  filters: NotificationListFilters,
): Promise<NotificationRow[]> {
  const offset = (filters.page - 1) * filters.limit;
  const rows = await processReturnQuery(
    `SELECT id, notification_type, title, message, payload, created_at, read_at
     FROM public.notification
     WHERE user_id = $1 AND ($2::boolean = FALSE OR read_at IS NULL)
     ORDER BY created_at DESC, id DESC
     LIMIT $3 OFFSET $4`,
    [userId, filters.unreadOnly, filters.limit, offset],
  );
  return rows as NotificationRow[];
}

export async function countUserNotifications(
  userId: string,
  unreadOnly: boolean,
): Promise<number> {
  const rows = await processReturnQuery(
    `SELECT COUNT(*)::int AS total
     FROM public.notification
     WHERE user_id = $1 AND ($2::boolean = FALSE OR read_at IS NULL)`,
    [userId, unreadOnly],
  );
  return Number(rows[0]?.total ?? 0);
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const rows = await processReturnQuery(
    `SELECT COUNT(*)::int AS total
     FROM public.notification
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return Number(rows[0]?.total ?? 0);
}

export async function markOwnedNotificationAsRead(
  userId: string,
  notificationId: string,
): Promise<NotificationReadRow | null> {
  const rows = await processReturnQuery(
    `UPDATE public.notification
     SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING id, read_at`,
    [notificationId, userId],
  );
  return (rows[0] as NotificationReadRow | undefined) ?? null;
}
