export interface MeetingRequest {
  recipientHandle: string;
  guestName?: string;
  guestEmail?: string;
  title: string;
  message?: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
}

export interface MeetingRequestDB {
  recipient_handle: string;
  guest_name?: string;
  guest_email?: string;
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
  CANCELLED = "cancelled",
  RESCHEDULE_PROPOSED = "reschedule_proposed"
}

export enum NotificationType {
  CREATED = "meeting_request_created",
  UPDATED = "meeting_request_updated",
  CANCELLED = "meeting_request_cancelled",
  ACCEPTED = "meeting_request_accepted",
  REJECTED = "meeting_request_rejected",
  RESCHEDULED = "meeting_request_rescheduled",
  RESCHEDULE_ANSWERED = "meeting_request_reschedule_answered"
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
  id: string;
  title: string;
  message: string | null;
  requested_start_at: Date;
  requested_end_at: Date;
  timezone: string;
  status: MeetingRequestStatus;
  created_at: Date;
  resolved_at?: Date | null;
  owner_response_message?: string | null;
  guest_name: string | null;
  guest_email: string | null;
  meet_url?: string | null;
  cancellation_reason?: string | null;
  proposed_start_at?: Date | null;
  proposed_end_at?: Date | null;
  proposal_message?: string | null;
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
  resolvedAt: Date | null;
  ownerResponseMessage: string | null;
  guestName: string | null;
  guestEmail: string | null;
  meetUrl: string | null;
  cancellationReason: string | null;
  proposedStartsAt: Date | null;
  proposedEndsAt: Date | null;
  proposalMessage: string | null;
}

export interface ListedRequestsResponse {
  id: string;
  handleName: string | null;
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
  ownerResponseMessage?: string | null;
  guestEmail: string | null;
  meetUrl: string | null;
  cancellationReason: string | null;
  proposedStartsAt: Date | null;
  proposedEndsAt: Date | null;
  proposalMessage: string | null;
}

export interface ListedRequestsRows {
  id: string;
  recipient_handle: string | null;
  recipient_name: string;
  recipient_surname: string;
  profile_picture: string | null;
  title: string;
  message?: string | null;
  requested_start_at: Date;
  requested_end_at: Date;
  timezone: string;
  status: MeetingRequestStatus;
  created_at: Date;
  resolved_at: Date | null;
  owner_response_message?: string | null;
  guest_email: string | null;
  meet_url?: string | null;
  cancellation_reason?: string | null;
  proposed_start_at?: Date | null;
  proposed_end_at?: Date | null;
  proposal_message?: string | null;
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

export interface MeetingRequestDecision {
  decision:
  | MeetingRequestStatus.ACCEPTED
  | MeetingRequestStatus.REJECTED;
  responseMessage?: string;
}

export interface RescheduleProposal {
  startsAt: Date;
  endsAt: Date;
  message?: string;
}

export enum ProposalAnswer {
  ACCEPTED = "accepted",
  COUNTER = "counter"
}

export interface ProposalResponse {
  decision: ProposalAnswer;
  startsAt?: Date;
  endsAt?: Date;
  timeZone?: string;
  message?: string;
}

export interface CancelMeetingRequest {
  reason: string;
}

export interface MeetingRequestDecisionRow {
  id: string;
  requester_user_id: string | null;
  recipient_user_id: string;
  requested_start_at: Date;
  requested_end_at: Date;
  timezone: string;
  title: string;
  message: string | null;
  status: MeetingRequestStatus;
  guest_name?: string | null;
  guest_email?: string | null;
  proposed_start_at?: Date | null;
  proposed_end_at?: Date | null;
  proposal_message?: string | null;
}

export interface RequesterContactRow {
  requester_name: string | null;
  requester_email: string | null;
}