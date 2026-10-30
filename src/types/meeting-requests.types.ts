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
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  CANCELLED = "cancelled"
}

export enum NotificationType {
  CREATED = "meeting_request_created",
  UPDATED = "meeting_request_updated"
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
export interface MeetingRequestRow {
  id: string,
  title: string,
  message: string | null,
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

export interface ListedRequestsResponse {
  id: string;
  handleName: string;
  name: string;
  firstSurname: string;
  title: string;
  message?: string | null;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  status: MeetingRequestStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  ownerResponseMessage?: string | null
}

export interface ListedRequestsRows {
  id: string;
  recipient_handle: string;
  recipient_name: string;
  recipient_surname: string;
  title: string;
  message?: string | null;
  requested_start_at: Date;
  requested_end_at: Date;
  timezone: string;
  status: MeetingRequestStatus;
  created_at: Date;
  resolved_at: Date | null;
  owner_response_message?: string | null
}

export interface UpdateMeetingRequest {
  title?: string;
  message?: string;
  startsAt?: Date;
  endsAt?: Date;
  timeZone?: string;
}

export interface UpdateMeetingRequestDB {
  title?: string;
  message?: string;
  requested_start_at?: Date;
  requested_end_at?: Date;
  timezone?: string;
}