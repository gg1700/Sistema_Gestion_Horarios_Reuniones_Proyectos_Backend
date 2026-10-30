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
  const values = [recipientUserId, MeetingReqTypes.CalendarEvent.CANCELLED ,startAt, endsAt];
  const scheduledActivities = await client.query(query, values);
  return scheduledActivities.rows;
}

export async function findPendingRequests(recipientUserId: string, startAt: Date, endsAt: Date, client: PoolClient) {
  const query = `SELECT id, requested_start_at, requested_end_at FROM "meeting_request"
    WHERE recipient_user_id = $1 AND requested_start_at < $3
    AND requested_end_at > $2 AND status = $4`;
  const values = [recipientUserId, startAt, endsAt, MeetingReqTypes.MeetingRequestStatus.PENDING];
  const pendingRequests = await client.query(query, values);
  return pendingRequests.rows;
}

export async function createMeetingRequest(
  userId: string,
  recipientUserId: string,
  requestInfo: MeetingReqTypes.MeetingRequestDB,
  client: PoolClient) {
  const query = `INSERT INTO "meeting_request" (
    requester_user_id, recipient_user_id, requested_start_at, requested_end_at, 
    timezone, title, message, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`;
  const { title, message, start_at, end_at, timezone } = requestInfo;
  const values = [userId, recipientUserId, start_at, end_at, timezone, title, message, MeetingReqTypes.MeetingRequestStatus.PENDING];
  const newMeetingRequest = await client.query(query, values);
  return newMeetingRequest.rows;
}

export async function createNotification(
  recipientUserId: string,
  userId: string,
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
    userId,
    requestId,
    MeetingReqTypes.NotificationType.CREATED,
    "Nueva solicitud de reunion",
    `Has recibido una solicitud de reunion: ${title}`,
    payload
  ];
  const notificacion = await client.query(query, values);
  return notificacion.rows;
}