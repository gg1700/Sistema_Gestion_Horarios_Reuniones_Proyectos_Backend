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
  requested_start_at: Date;
  requested_end_at: Date;
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
export interface CreateMeetingRequestResult {
  result: boolean;
  statusCode: number;
  message: string;
  data?: MeetingRequestResponse;
}
export interface MetingRequestRow {
  id: string,
  title: string,
  message?: string,
  requested_start_at: Date,
  requested_end_at: Date,
  timezone: string,
  status: MeetingRequestStatus,
  created_at: Date
}
export interface MeetingRequestResponse {
  id: string;
  title: string;
  message?: string | null;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  status: MeetingRequestStatus;
  createdAt: Date;
}