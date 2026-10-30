export interface MeetingRequest {
  recipientHandle: string;
  title: string;
  message?: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
}

export interface MeetingRequestDB {
  recipient_handle: string;
  title: string;
  message?: string;
  start_at: Date;
  end_at: Date;
  timezone: string;
}

export enum MeetingRequestStatus {
  PENDING = "pending"
}

export enum NotificationType {
  CREATED = "meeting_request_created"
}

export enum CalendarEvent {
  CANCELLED = "cancelled"
}