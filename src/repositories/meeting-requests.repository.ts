import * as ProfileTypes from "../types/profile.types";
import { processReturnQuery } from "../utils/query";
import * as MeetingReqTypes from "../types/meeting-requests.types";
import { PoolClient } from "pg";

export async function findRecipientUserByHandle(recipientHandle: string) {
  const query = `SELECT id, handle_name, name, first_surname FROM "user"
    WHERE handle_name = $1 AND deleted_at IS NULL AND status = $2`;
  const values = [recipientHandle, ProfileTypes.UserStatus.ACTIVE];
  const recipientUserFound = await processReturnQuery(query, values);
  return recipientUserFound;
}

export async function hasPublicCalendarActive(recipientUserId: string) {
  const query = `SELECT active FROM "public_calendar_link"
    WHERE user_id = $1 AND active = $2`;
  const values = [recipientUserId, true];
  const calendarLink = await processReturnQuery(query, values);
  return calendarLink.length !== 0;
}

export async function findRecipientTimezone(recipientUserId: string) {
  const query = `SELECT timezone FROM "calendar_settings"
    WHERE user_id = $1`;
  const values = [recipientUserId];
  const recipientTimezone = await processReturnQuery(query, values);
  return recipientTimezone;
}

export async function findAvailableSchedules(
  recipientUserId: string,
  day: number,
  startTime: string,
  endTime: string,
  client: PoolClient) {
  const query = `SELECT id, start_time, end_time FROM "availability_rule"
    WHERE user_id = $1 AND day_of_week = $2 AND active = $3
    AND start_time <= $4::time AND end_time >= $5::time`;
  const values = [recipientUserId, day, true, startTime, endTime];
  const availableSchedules = await client.query(query, values);
  return availableSchedules.rows;
}

export async function findCalendarSchedules(recipientUserId: string, startAt: Date, endsAt: Date, client: PoolClient) {
  const query = `SELECT id, starts_at, ends_at FROM "calendar_event"
    WHERE user_id = $1 AND event_status <> $2
    AND starts_at < $4 AND ends_at > $3`;
  const values = [recipientUserId, MeetingReqTypes.CalendarEvent.CANCELLED, startAt, endsAt];
  const scheduledActivities = await client.query(query, values);
  return scheduledActivities.rows;
}

export async function findPendingRequests(recipientUserId: string, startAt: Date, endsAt: Date, client: PoolClient) {
  const query = `SELECT id, requested_start_at, requested_end_at FROM "meeting_request"
    WHERE recipient_user_id = $1 AND (
      (status = $4 AND requested_start_at < $3 AND requested_end_at > $2)
      OR (status = $5 AND proposed_start_at < $3 AND proposed_end_at > $2))`;
  const values = [recipientUserId, startAt, endsAt, MeetingReqTypes.MeetingRequestStatus.PENDING,
    MeetingReqTypes.MeetingRequestStatus.RESCHEDULE_PROPOSED];
  const pendingRequests = await client.query(query, values);
  return pendingRequests.rows;
}

export async function createMeetingRequest(
  requesterUserId: string | null,
  recipientUserId: string,
  requestInfo: MeetingReqTypes.MeetingRequestDB,
  client: PoolClient) {
  const query = `INSERT INTO "meeting_request" (
    requester_user_id, recipient_user_id, requested_start_at, requested_end_at,
    timezone, title, message, guest_name, guest_email, status)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  RETURNING *`;
  const { title, message, guest_name, guest_email, requested_start_at, requested_end_at, timezone } = requestInfo;
  const values = [
    requesterUserId,
    recipientUserId,
    requested_start_at,
    requested_end_at,
    timezone,
    title,
    message ?? null,
    guest_name ?? null,
    guest_email ?? null,
    MeetingReqTypes.MeetingRequestStatus.PENDING
  ];
  const newMeetingRequest = await client.query(query, values);
  return newMeetingRequest.rows;
}

export async function createNotification(
  recipientUserId: string,
  actorUserId: string | null,
  requestId: string,
  requestInfo: MeetingReqTypes.MeetingRequestDB,
  client: PoolClient) {
  const query = `INSERT INTO "notification" (
    user_id, actor_user_id, meeting_request_id, notification_type,
    title, message, payload)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    RETURNING *`;
  const payload = JSON.stringify({ requestId });
  const { title } = requestInfo;
  const values = [
    recipientUserId,
    actorUserId,
    requestId,
    MeetingReqTypes.NotificationType.CREATED,
    "Nueva solicitud de reunion",
    `Has recibido una solicitud de reunion: ${title}`,
    payload
  ];
  const notification = await client.query(query, values);
  return notification.rows;
}

export async function lockRecipientUser(
  recipientUserId: string,
  client: PoolClient
) {
  const query = `SELECT id FROM public."user"
    WHERE id = $1 AND deleted_at IS NULL AND status = 'active'
    FOR UPDATE`;
  const values = [recipientUserId]
  const result = await client.query(query, values);
  return result.rows.length !== 0;
}

export async function listRequests(
  userId: string,
  actionType: "sent" | "received",
  status?: string,
  page?: number,
  limit?: number) {
  const userConstraint = (actionType === "sent") ? "requester_user_id" : "recipient_user_id";
  const counterpartHandle = (actionType === "sent") ? "recipient.handle_name" : "requester.handle_name";
  const counterpartName = (actionType === "sent") ? "recipient.name" : "COALESCE(requester.name, mr.guest_name)";
  const counterpartSurname = (actionType === "sent") ? "recipient.first_surname" : "COALESCE(requester.first_surname, '')";
  const counterpartProfilePicture = (actionType === "sent") ? "recipient.profile_picture" : "requester.profile_picture";
  const guestEmail = (actionType === "received") ? "mr.guest_email" : "NULL::varchar";
  const limitValue = (limit !== undefined) ? limit : 20;
  const offsetValue = (page !== undefined) ? (page - 1) * limitValue : 0;
  const values: unknown[] = [userId, limitValue, offsetValue];
  let filter = "";
  if (status !== undefined) {
    values.push(status);
    filter = `AND mr.status = $${values.length}`;
  }
  const query = `SELECT mr.id, mr.title, mr.message, mr.requested_start_at, mr.requested_end_at,
    mr.timezone, mr.status, mr.created_at, mr.resolved_at, mr.owner_response_message,
    mr.meet_url, mr.cancellation_reason,
    mr.proposed_start_at, mr.proposed_end_at, mr.proposal_message,
    ${counterpartHandle} AS recipient_handle,
    ${counterpartName} AS recipient_name,
    ${counterpartSurname} AS recipient_surname,
    ${counterpartProfilePicture} AS profile_picture,
    ${guestEmail} AS guest_email
    FROM "meeting_request" mr
    LEFT JOIN "user" requester ON requester.id = mr.requester_user_id
    JOIN "user" recipient ON recipient.id = mr.recipient_user_id
    WHERE mr.${userConstraint} = $1 ${filter}
    ORDER BY mr.created_at DESC, mr.id DESC
    LIMIT $2 OFFSET $3`;
  const sentRequests = await processReturnQuery(query, values);
  return sentRequests;
}

export async function findRequestForRequester(requestId: string, userId: string, client: PoolClient) {
  const query = `SELECT id, requester_user_id, recipient_user_id,
    requested_start_at, requested_end_at, timezone, title, message, status,
    proposed_start_at, proposed_end_at, proposal_message
    FROM "meeting_request"
    WHERE id = $1 AND requester_user_id = $2
    FOR UPDATE`;
  const values = [requestId, userId];
  const requestFound = await client.query(query, values);
  return requestFound.rows;
}

export async function hasPublicCalendarActiveWithClient(userId: string, client: PoolClient) {
  const query = `SELECT active FROM "public_calendar_link"
    WHERE user_id = $1 AND active = $2`;
  const values = [userId, true];
  const calendarLink = await client.query(query, values);
  return calendarLink.rows.length !== 0;
}

export async function findRecipientTimezoneWithClient(recipientUserId: string, client: PoolClient) {
  const query = `SELECT timezone FROM "calendar_settings"
    WHERE user_id = $1`;
  const values = [recipientUserId];
  const recipientTimezone = await client.query(query, values);
  return recipientTimezone.rows;
}

export async function findOtherPendingRequests(
  recipientUserId: string,
  requestId: string,
  startAt: Date,
  endsAt: Date,
  client: PoolClient) {
  const query = `SELECT id, requested_start_at, requested_end_at
    FROM "meeting_request"
    WHERE recipient_user_id = $1 AND id <> $2 AND (
      (status = $5 AND requested_start_at < $4 AND requested_end_at > $3)
      OR (status = $6 AND proposed_start_at < $4 AND proposed_end_at > $3))`;
  const values = [
    recipientUserId,
    requestId,
    startAt,
    endsAt,
    MeetingReqTypes.MeetingRequestStatus.PENDING,
    MeetingReqTypes.MeetingRequestStatus.RESCHEDULE_PROPOSED
  ];
  const pendingRequests = await client.query(query, values);
  return pendingRequests.rows;
}

export async function updatePendingRequest(
  requestId: string,
  userId: string,
  requestInfo: MeetingReqTypes.UpdateMeetingRequestDB,
  client: PoolClient) {
  const fields: string[] = [];
  const values: unknown[] = [requestId, userId];
  const allowedFields: Record<string, string> = {
    title: "title",
    message: "message",
    requested_start_at: "requested_start_at",
    requested_end_at: "requested_end_at",
    timezone: "timezone"
  };

  for (const [field, value] of Object.entries(requestInfo)) {
    const column = allowedFields[field];
    if (column !== undefined && value !== undefined) {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    }
  }
  if (fields.length === 0) return [];

  const query = `UPDATE "meeting_request"
    SET ${fields.join(", ")}
    WHERE id = $1 AND requester_user_id = $2 AND status = $${values.length + 1}
    RETURNING id, title, message, requested_start_at,
    requested_end_at, timezone, status, created_at`;
  values.push(MeetingReqTypes.MeetingRequestStatus.PENDING);
  const updatedRequest = await client.query(query, values);
  return updatedRequest.rows;
}

export async function createUpdateNotification(
  recipientUserId: string,
  requesterUserId: string,
  requestId: string,
  requestInfo: MeetingReqTypes.UpdateMeetingRequestDB,
  client: PoolClient) {
  const query = `INSERT INTO "notification" (
    user_id, actor_user_id, meeting_request_id, notification_type,
    title, message, payload)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    RETURNING *`;
  const payload = JSON.stringify({ requestId, action: "updated" });
  const values = [
    recipientUserId,
    requesterUserId,
    requestId,
    MeetingReqTypes.NotificationType.UPDATED,
    "Solicitud de reunion actualizada",
    `El solicitante ha actualizado la solicitud de reunion${requestInfo.title ? `: ${requestInfo.title}` : ""}`,
    payload
  ];
  const notification = await client.query(query, values);
  return notification.rows;
}

export async function cancelPendingRequest(
  requestId: string,
  userId: string,
  reason: string,
  client: PoolClient) {
  const query = `UPDATE "meeting_request"
    SET status = $3, cancellation_reason = $5, resolved_at = NOW(), updated_at = NOW(),
    proposed_start_at = NULL, proposed_end_at = NULL, proposal_message = NULL, proposed_at = NULL
    WHERE id = $1
    AND requester_user_id = $2
    AND status IN ($4, $6)
    RETURNING
    id,
    title,
    message,
    requested_start_at,
    requested_end_at,
    timezone,
    status,
    created_at,
    resolved_at,
    owner_response_message,
    cancellation_reason`;
  const values = [
    requestId,
    userId,
    MeetingReqTypes.MeetingRequestStatus.CANCELLED,
    MeetingReqTypes.MeetingRequestStatus.PENDING,
    reason,
    MeetingReqTypes.MeetingRequestStatus.RESCHEDULE_PROPOSED
  ];
  const cancelledRequest = await client.query(query, values);
  return cancelledRequest.rows;
}

export async function createCancelNotification(
  recipientUserId: string,
  requesterUserId: string,
  requestId: string,
  title: string,
  reason: string,
  client: PoolClient) {
  const query = `INSERT INTO "notification" (
    user_id, actor_user_id, meeting_request_id, notification_type,
    title, message, payload)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    RETURNING *`;
  const payload = JSON.stringify({
    requestId,
    action: "cancelled",
    reason
  });
  const values = [
    recipientUserId,
    requesterUserId,
    requestId,
    MeetingReqTypes.NotificationType.CANCELLED,
    "Solicitud de reunion cancelada",
    `El solicitante ha cancelado la solicitud de reunion: ${title}. Motivo: ${reason}`,
    payload
  ];
  const notification = await client.query(query, values);
  return notification.rows;
}

export async function findRequestForRecipient(
  requestId: string,
  recipientUserId: string,
  client: PoolClient) {
  const query = `SELECT id, requester_user_id, recipient_user_id, requested_start_at,
    requested_end_at, timezone, title, message, status, guest_name, guest_email FROM "meeting_request"
    WHERE id = $1 AND recipient_user_id = $2
    FOR UPDATE`;
  const values = [requestId, recipientUserId];
  const requestFound = await client.query(query, values);
  return requestFound.rows;
}

export async function updateMeetingRequestDecision(
  requestId: string,
  recipientUserId: string,
  decision:
    | MeetingReqTypes.MeetingRequestStatus.ACCEPTED
    | MeetingReqTypes.MeetingRequestStatus.REJECTED,
  responseMessage: string | null,
  calendarEventId: string | null,
  client: PoolClient,
  meetUrl: string | null = null,
  requesterCalendarEventId: string | null = null) {
  const query = `UPDATE "meeting_request" SET
    status = $3,
    owner_response_message = $4,
    calendar_event_id = $5,
    meet_url = $7,
    requester_calendar_event_id = $8,
    resolved_at = NOW(),
    updated_at = NOW()
    WHERE id = $1 AND recipient_user_id = $2 AND status = $6
    RETURNING
    id, title, message, requested_start_at, requested_end_at,
    timezone, status, created_at, resolved_at, owner_response_message,
    guest_name, guest_email, meet_url, cancellation_reason`;
  const values = [
    requestId,
    recipientUserId,
    decision,
    responseMessage,
    calendarEventId,
    MeetingReqTypes.MeetingRequestStatus.PENDING,
    meetUrl,
    requesterCalendarEventId
  ];
  const updatedRequest = await client.query(query, values);
  return updatedRequest.rows;
}

export async function createDecisionNotification(
  requesterUserId: string,
  recipientUserId: string,
  requestId: string,
  decision:
    | MeetingReqTypes.MeetingRequestStatus.ACCEPTED
    | MeetingReqTypes.MeetingRequestStatus.REJECTED,
  client: PoolClient,
  detail: string | null = null) {
  const isAccepted = (decision === MeetingReqTypes.MeetingRequestStatus.ACCEPTED);
  const notificationType = isAccepted
    ? MeetingReqTypes.NotificationType.ACCEPTED
    : MeetingReqTypes.NotificationType.REJECTED;
  const notificationTitle = isAccepted
    ? "Solicitud de reunion aceptada"
    : "Solicitud de reunion rechazada";
  const baseMessage = isAccepted
    ? "El destinatario ha aceptado tu solicitud de reunion."
    : "El destinatario ha rechazado tu solicitud de reunion.";
  const notificationMessage = !detail
    ? baseMessage
    : isAccepted
      ? `${baseMessage} Enlace de Google Meet: ${detail}`
      : `${baseMessage} Motivo: ${detail}`;
  const payload = JSON.stringify({
    requestId,
    action: decision,
    ...(detail ? (isAccepted ? { meetUrl: detail } : { reason: detail }) : {})
  });

  const query = `INSERT INTO "notification" (user_id, actor_user_id, meeting_request_id,
    notification_type, title, message, payload)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    RETURNING *`;
  const values = [
    requesterUserId,
    recipientUserId,
    requestId,
    notificationType,
    notificationTitle,
    notificationMessage,
    payload
  ];
  const notification = await client.query(query, values);
  return notification.rows;
}
export async function findRequesterContact(requestId: string, client: PoolClient) {
  const query = `SELECT
    COALESCE(NULLIF(BTRIM(CONCAT(u.name, ' ', u.first_surname)), ''), mr.guest_name) AS requester_name,
    COALESCE(u.email, mr.guest_email) AS requester_email
    FROM "meeting_request" mr
    LEFT JOIN "user" u ON u.id = mr.requester_user_id
    WHERE mr.id = $1`;
  const requester = await client.query(query, [requestId]);
  return requester.rows as MeetingReqTypes.RequesterContactRow[];
}

const requestColumns = `id, title, message, requested_start_at, requested_end_at, timezone, status,
  created_at, resolved_at, owner_response_message, guest_name, guest_email, meet_url,
  cancellation_reason, proposed_start_at, proposed_end_at, proposal_message`;

/** El anfitrion propone otro horario: la solicitud queda a la espera de la respuesta del solicitante. */
export async function proposeReschedule(
  requestId: string,
  recipientUserId: string,
  startsAt: Date,
  endsAt: Date,
  message: string | null,
  client: PoolClient) {
  const query = `UPDATE "meeting_request"
    SET status = $5, proposed_start_at = $3, proposed_end_at = $4, proposal_message = $6,
    proposed_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND recipient_user_id = $2 AND status = $7
    RETURNING ${requestColumns}`;
  const values = [requestId, recipientUserId, startsAt, endsAt,
    MeetingReqTypes.MeetingRequestStatus.RESCHEDULE_PROPOSED, message,
    MeetingReqTypes.MeetingRequestStatus.PENDING];
  const result = await client.query(query, values);
  return result.rows;
}

/** Cambia el horario de una solicitud pendiente (usado al confirmar con otro horario a un visitante). */
export async function moveRequestSchedule(
  requestId: string,
  recipientUserId: string,
  startsAt: Date,
  endsAt: Date,
  client: PoolClient) {
  const query = `UPDATE "meeting_request"
    SET requested_start_at = $3, requested_end_at = $4, updated_at = NOW()
    WHERE id = $1 AND recipient_user_id = $2 AND status = $5
    RETURNING ${requestColumns}`;
  const values = [requestId, recipientUserId, startsAt, endsAt, MeetingReqTypes.MeetingRequestStatus.PENDING];
  const result = await client.query(query, values);
  return result.rows;
}

/** El solicitante acepta la propuesta: el horario propuesto pasa a ser el solicitado. */
export async function applyProposal(requestId: string, requesterUserId: string, client: PoolClient) {
  const query = `UPDATE "meeting_request"
    SET requested_start_at = proposed_start_at, requested_end_at = proposed_end_at, status = $3,
    proposed_start_at = NULL, proposed_end_at = NULL, proposal_message = NULL, proposed_at = NULL,
    updated_at = NOW()
    WHERE id = $1 AND requester_user_id = $2 AND status = $4
    RETURNING ${requestColumns}`;
  const values = [requestId, requesterUserId, MeetingReqTypes.MeetingRequestStatus.PENDING,
    MeetingReqTypes.MeetingRequestStatus.RESCHEDULE_PROPOSED];
  const result = await client.query(query, values);
  return result.rows;
}

/** Deja la solicitud como estaba antes de aplicar la propuesta (si la confirmacion fallo). */
export async function restoreProposal(
  requestId: string,
  original: { requestedStart: Date; requestedEnd: Date; proposedStart: Date; proposedEnd: Date; message: string | null },
  client: PoolClient) {
  const query = `UPDATE "meeting_request"
    SET status = $2, requested_start_at = $3, requested_end_at = $4,
    proposed_start_at = $5, proposed_end_at = $6, proposal_message = $7, proposed_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND status = $8
    RETURNING id`;
  const values = [requestId, MeetingReqTypes.MeetingRequestStatus.RESCHEDULE_PROPOSED,
    original.requestedStart, original.requestedEnd, original.proposedStart, original.proposedEnd,
    original.message, MeetingReqTypes.MeetingRequestStatus.PENDING];
  const result = await client.query(query, values);
  return result.rows;
}

/** El solicitante responde con otro horario: la solicitud vuelve a quedar pendiente para el anfitrion. */
export async function counterProposal(
  requestId: string,
  requesterUserId: string,
  startsAt: Date,
  endsAt: Date,
  timeZone: string | null,
  client: PoolClient) {
  const query = `UPDATE "meeting_request"
    SET requested_start_at = $3, requested_end_at = $4, timezone = COALESCE($5, timezone), status = $6,
    proposed_start_at = NULL, proposed_end_at = NULL, proposal_message = NULL, proposed_at = NULL,
    updated_at = NOW()
    WHERE id = $1 AND requester_user_id = $2 AND status = $7
    RETURNING ${requestColumns}`;
  const values = [requestId, requesterUserId, startsAt, endsAt, timeZone,
    MeetingReqTypes.MeetingRequestStatus.PENDING, MeetingReqTypes.MeetingRequestStatus.RESCHEDULE_PROPOSED];
  const result = await client.query(query, values);
  return result.rows;
}

export async function createRescheduleNotification(
  userId: string,
  actorUserId: string,
  requestId: string,
  type: MeetingReqTypes.NotificationType.RESCHEDULED | MeetingReqTypes.NotificationType.RESCHEDULE_ANSWERED,
  title: string,
  message: string,
  payload: Record<string, unknown>,
  client: PoolClient) {
  const query = `INSERT INTO "notification" (
    user_id, actor_user_id, meeting_request_id, notification_type,
    title, message, payload)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    RETURNING *`;
  const values = [userId, actorUserId, requestId, type, title, message, JSON.stringify({ requestId, ...payload })];
  const notification = await client.query(query, values);
  return notification.rows;
}
