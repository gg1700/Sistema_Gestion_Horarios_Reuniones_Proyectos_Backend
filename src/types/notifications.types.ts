export interface NotificationListFilters {
  unreadOnly: boolean;
  page: number;
  limit: number;
}

export interface NotificationRow {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  payload: Record<string, unknown>;
  created_at: Date | string;
  read_at: Date | string | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationListResult {
  items: NotificationItem[];
  page: number;
  limit: number;
  total: number;
  unreadCount: number;
}

export interface NotificationReadRow {
  id: string;
  read_at: Date | string;
}

export interface NotificationReadResult {
  id: string;
  readAt: string;
}
