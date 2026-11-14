import { processTransaction } from "../utils/query";
import { PoolClient } from "pg";
import * as MeetingReqTypes from "../types/meeting-requests.types";
import * as ProfileRepo from "../repositories/profile.repository";
import * as MeetingReqRepo from "../repositories/meeting-requests.repository";
import * as Mapper from "../helpers/mapper.helper";
import * as DateUtils from "../utils/date";
import { ServerError, ConflictError } from "../helpers/errors.helper";
import { findGoogleCalendarForUser, upsertCalendarEventMirror } from "../repositories/calendarEvents.repository";
import { createGoogleEvent, deleteGoogleEvent } from "./googleCalendarClient.service";
import type { CreateCalendarEventInput, GoogleCalendarEvent, GoogleCalendarForUser } from "../types/calendarEvents.types";
import type { UpsertCalendarEventMirrorInput } from "../repositories/calendarEvents.repository";
import { synchronizeCalendarEvents } from "./calendarEvents.service";

export async function createMeetingRequest(
  userId: string | null,
  meetingReqInfo: MeetingReqTypes.MeetingRequest) {
  try {
    if (userId !== null) {
      const userFound = await ProfileRepo.existsUser(userId);
      if (!userFound) return { result: false, statusCode: 404, message: "El usuario no existe" };
    }
    const formatedInfo = Mapper.meetingReqInfoToDB(meetingReqInfo);

    const recipientHandle = formatedInfo.recipient_handle;
    const recipientUserFound = await MeetingReqRepo.findRecipientUserByHandle(recipientHandle);
    if (!recipientUserFound || recipientUserFound.length === 0)
      return { result: false, statusCode: 404, message: "El usuario solicitado no existe" };

    const recipientUserId = recipientUserFound[0].id;
    if (userId !== null && recipientUserId === userId)
      return { result: false, statusCode: 400, message: "El usuario solicitado es el usuario solicitante" };

    const publicCalendarFound = await MeetingReqRepo.hasPublicCalendarActive(recipientUserId);
    if (!publicCalendarFound)
      return { result: false, statusCode: 400, message: "El usuario solicitado no tiene un calendario publico disponible" };

    if (formatedInfo.requested_start_at.getTime() <= Date.now())
      return { result: false, statusCode: 400, message: "La fecha de inicio debe ser futura" };
    if (formatedInfo.requested_end_at <= formatedInfo.requested_start_at)
      return { result: false, statusCode: 400, message: "La fecha de finalización debe ser posterior al inicio" };

    const recipientTimezone = await MeetingReqRepo.findRecipientTimezone(recipientUserId);
    const timezone = (!recipientTimezone || recipientTimezone.length === 0) ? "UTC" : recipientTimezone[0].timezone;
    const startTime = formatedInfo.requested_start_at;
    const endTime = formatedInfo.requested_end_at;
    const startDate = DateUtils.getLocalDate(startTime, timezone);
    const endDate = DateUtils.getLocalDate(endTime, timezone);
    const startDay = DateUtils.getLocalWeekDay(startTime, timezone);
    const endDay = DateUtils.getLocalWeekDay(endTime, timezone)
    const startHour = DateUtils.getLocalTime(startTime, timezone);
    const endHour = DateUtils.getLocalTime(endTime, timezone);
    if (startDay !== endDay || startDate !== endDate)
      return { result: false, statusCode: 400, message: "No es posible solicitar una reunion que dure mas de un dia" };

    const ans = await processTransaction<MeetingReqTypes.CreateMeetingRequestResult>(async function (client: PoolClient) {
      const recipientLooked = await MeetingReqRepo.lockRecipientUser(recipientUserId, client);
      if (!recipientLooked)
        return { result: false, statusCode: 404, message: "El usuario solicitado ya no esta disponible" };

      const availableSchedules = await MeetingReqRepo.
        findAvailableSchedules(recipientUserId, startDay, startHour, endHour, client);
      if (!availableSchedules || availableSchedules.length === 0) {
        return {
          result: false,
          statusCode: 409,
          message: "Horario de solicitud no coincide con ningun horario disponible del usuario solicitado"
        };
      }
      const scheduledActivities = await MeetingReqRepo.findCalendarSchedules(recipientUserId, startTime, endTime, client);
      if (scheduledActivities.length > 0) {
        return {
          result: false,
          statusCode: 409,
          message: "Horario de solicitud invalido, ocupado por otra actividad ya programada por el usuario solicitado"
        };
      }
      const pendingRequests = await MeetingReqRepo.findPendingRequests(recipientUserId, startTime, endTime, client);
      if (pendingRequests.length > 0) {
        return {
          result: false,
          statusCode: 409,
          message: "Solicitud rechazada, ya hay solicitudes pendientes que solicitan ese horario"
        };
      }

      const newMeetingRequest = await MeetingReqRepo.createMeetingRequest(userId, recipientUserId, formatedInfo, client);
      if (!newMeetingRequest || newMeetingRequest.length === 0)
        throw new ServerError("Error al registrar solicitud de reunion");

      const requestId = newMeetingRequest[0].id;
      const notification = await MeetingReqRepo.createNotification(recipientUserId, userId, requestId, formatedInfo, client);
      if (!notification || notification.length === 0)
        throw new ServerError("Error al crear notificacion de solicitud de reunion");

      const formatedData = Mapper.meetingRequestToResponse(newMeetingRequest[0]);
      return {
        result: true,
        statusCode: 201,
        message: "Solicitud de reunion registrada correctamente",
        data: formatedData
      };
    });

    return ans;
  } catch (err) {
    if (err instanceof ServerError) {
      return {
        result: false,
        statusCode: err.statusCode,
        message: err.message
      };
    }

    return { result: false, statusCode: 500, message: `Error en el servicio: ${(err as Error).message}` };
  }
}

export async function listSentMeetingRequests(
  userId: string,
  type: "sent" | "received",
  status?: string,
  page?: number,
  limit?: number) {
  try {
    const userFound = await ProfileRepo.existsUser(userId);
    if (!userFound) return { result: false, statusCode: 404, message: "El usuario no existe" };

    const action = (type == "sent") ? "enviadas" : "recibidas";

    const sentRequests = await MeetingReqRepo.listRequests(userId, type, status, page, limit);
    if (!sentRequests) return { result: false, statusCode: 400, message: `Error al obtener solicitudes ${action}` };
    if (sentRequests.length === 0)
      return { result: true, statusCode: 200, message: `El usuario no tiene solicitudes ${action}`, data: [] };

    const formatedData = sentRequests.map(sr => Mapper.listedSentRequestToResponse(sr));
    return {
      result: true,
      statusCode: 200,
      message: `Lista de solicitudes ${action} por el usuario obtenidas correctamente`,
      data: formatedData
    };
  } catch (err) {
    return { result: false, statusCode: 500, message: `Error en el servicio: ${(err as Error).message}` };
  }
}

export async function updateMeetingRequest(
  userId: string,
  requestId: string,
  requestInfo: MeetingReqTypes.UpdateMeetingRequest) {
  try {
    const ans = await processTransaction(async function (client: PoolClient) {
      const requestFound = await MeetingReqRepo.findRequestForRequester(requestId, userId, client);
      if (!requestFound || requestFound.length === 0)
        return { result: false, statusCode: 404, message: "Solicitud de reunion no encontrada" };

      const request = requestFound[0];
      if (request.status !== MeetingReqTypes.MeetingRequestStatus.PENDING)
        return { result: false, statusCode: 409, message: "Solo se pueden modificar solicitudes pendientes" };

      const scheduleChanged =
        requestInfo.startsAt !== undefined ||
        requestInfo.endsAt !== undefined ||
        requestInfo.timeZone !== undefined;

      if (scheduleChanged) {
        const startTime = requestInfo.startsAt ?? request.requested_start_at;
        const endTime = requestInfo.endsAt ?? request.requested_end_at;
        if (startTime.getTime() <= Date.now())
          return { result: false, statusCode: 400, message: "La fecha de inicio debe ser futura" };
        if (endTime <= startTime)
          return { result: false, statusCode: 400, message: "La fecha de finalizacion debe ser posterior al inicio" };

        const recipientUserId = request.recipient_user_id;
        const recipientLooked = await MeetingReqRepo.lockRecipientUser(recipientUserId, client);
        if (!recipientLooked)
          return { result: false, statusCode: 409, message: "El destinatario ya no esta disponible" };

        const publicCalendarFound = await MeetingReqRepo.hasPublicCalendarActiveWithClient(recipientUserId, client);
        if (!publicCalendarFound)
          return { result: false, statusCode: 409, message: "El calendario publico del destinatario ya no esta disponible" };

        const recipientTimezoneFound = await MeetingReqRepo.findRecipientTimezoneWithClient(recipientUserId, client);
        const recipientTimezone = (!recipientTimezoneFound || recipientTimezoneFound.length === 0)
          ? "UTC"
          : recipientTimezoneFound[0].timezone;

        const startDate = DateUtils.getLocalDate(startTime, recipientTimezone);
        const endDate = DateUtils.getLocalDate(endTime, recipientTimezone);
        const startDay = DateUtils.getLocalWeekDay(startTime, recipientTimezone);
        const endDay = DateUtils.getLocalWeekDay(endTime, recipientTimezone);
        const startHour = DateUtils.getLocalTime(startTime, recipientTimezone);
        const endHour = DateUtils.getLocalTime(endTime, recipientTimezone);

        if (startDay !== endDay || startDate !== endDate)
          return { result: false, statusCode: 400, message: "No es posible solicitar una reunion que dure mas de un dia" };

        const availableSchedules = await MeetingReqRepo.findAvailableSchedules(
          recipientUserId, startDay, startHour, endHour, client);
        if (!availableSchedules || availableSchedules.length === 0) {
          return {
            result: false,
            statusCode: 409,
            message: "El horario solicitado no coincide con la disponibilidad del destinatario"
          };
        }

        const scheduledActivities = await MeetingReqRepo.findCalendarSchedules(
          recipientUserId, startTime, endTime, client);
        if (scheduledActivities.length > 0) {
          return {
            result: false,
            statusCode: 409,
            message: "El horario solicitado esta ocupado por otra actividad"
          };
        }

        const pendingRequests = await MeetingReqRepo.findOtherPendingRequests(
          recipientUserId, requestId, startTime, endTime, client);
        if (pendingRequests.length > 0)
          return {
            result: false,
            statusCode: 409,
            message: "Ya existen solicitudes pendientes para ese horario"
          };
      }

      const requestInfoDB: MeetingReqTypes.UpdateMeetingRequestDB = {};
      if (requestInfo.title !== undefined) requestInfoDB.title = requestInfo.title;
      if (requestInfo.message !== undefined) requestInfoDB.message = requestInfo.message;
      if (requestInfo.startsAt !== undefined) requestInfoDB.requested_start_at = requestInfo.startsAt;
      if (requestInfo.endsAt !== undefined) requestInfoDB.requested_end_at = requestInfo.endsAt;
      if (requestInfo.timeZone !== undefined) requestInfoDB.timezone = requestInfo.timeZone;

      const updatedRequest = await MeetingReqRepo.updatePendingRequest(requestId, userId, requestInfoDB, client);
      if (!updatedRequest || updatedRequest.length === 0) {
        return {
          result: false,
          statusCode: 409,
          message: "No se pudo actualizar la solicitud; puede que ya no este pendiente"
        };
      }

      const notification = await MeetingReqRepo.
        createUpdateNotification(request.recipient_user_id, userId, requestId, requestInfoDB, client);
      if (!notification || notification.length === 0)
        throw new ServerError("Error al crear la notificacion de actualizacion de solicitud");

      const formatedData = Mapper.meetingRequestToResponse(updatedRequest[0]);
      return {
        result: true,
        statusCode: 200,
        message: "Solicitud de reunion actualizada correctamente",
        data: formatedData
      };
    });

    return ans;
  } catch (err) {
    if (err instanceof ServerError)
      return { result: false, statusCode: err.statusCode, message: err.message };

    return { result: false, statusCode: 500, message: `Error en el servicio: ${(err as Error).message}` };
  }
}

export async function cancelMeetingRequest(userId: string, requestId: string, reason: string) {
  try {
    const ans = await processTransaction(async function (client: PoolClient) {
      const requestFound = await MeetingReqRepo.findRequestForRequester(requestId, userId, client);
      if (!requestFound || requestFound.length === 0)
        return { result: false, statusCode: 404, message: "Solicitud de reunion no encontrada" };

      const request = requestFound[0];
      if (request.status !== MeetingReqTypes.MeetingRequestStatus.PENDING &&
        request.status !== MeetingReqTypes.MeetingRequestStatus.RESCHEDULE_PROPOSED)
        return { result: false, statusCode: 409, message: "Solo se pueden cancelar solicitudes pendientes" };

      const cancelledRequest = await MeetingReqRepo.cancelPendingRequest(requestId, userId, reason, client);
      if (!cancelledRequest || cancelledRequest.length === 0) {
        return {
          result: false,
          statusCode: 409,
          message: "No se pudo cancelar la solicitud; puede que ya no este pendiente"
        };
      }

      const notification = await MeetingReqRepo.
        createCancelNotification(request.recipient_user_id, userId, requestId, request.title, reason, client);
      if (!notification || notification.length === 0)
        throw new ServerError("Error al crear la notificacion de cancelacion de solicitud");

      const formatedData = Mapper.meetingRequestToResponse(cancelledRequest[0]);
      return {
        result: true,
        statusCode: 200,
        message: "Solicitud de reunion cancelada correctamente",
        data: formatedData
      };
    });

    return ans;
  } catch (err) {
    if (err instanceof ServerError)
      return { result: false, statusCode: err.statusCode, message: err.message };

    return { result: false, statusCode: 500, message: `Error en el servicio: ${(err as Error).message}` };
  }
}

type DecisionFailure = {
  result: false;
  statusCode: number;
  message: string;
};

type DecisionSuccess = {
  result: true;
  statusCode: number;
  message: string;
  data: ReturnType<typeof Mapper.meetingRequestToResponse>;
};

type DecisionResult = DecisionFailure | DecisionSuccess;

type DecisionPreparation =
  | DecisionFailure
  | {
    result: true;
    request: MeetingReqTypes.MeetingRequestDecisionRow;
    recipientTimezone: string;
    requesterName: string | null;
    requesterEmail: string | null;
  };

async function ensureDecisionAvailability(
  request: MeetingReqTypes.MeetingRequestDecisionRow,
  client: PoolClient) {
  return ensureScheduleAvailable(request.recipient_user_id, request.id,
    request.requested_start_at, request.requested_end_at, client);
}

/**
 * Comprueba que el intervalo este dentro de la disponibilidad del anfitrion y no choque con
 * su agenda ni con otras solicitudes pendientes o propuestas. Devuelve la zona del anfitrion.
 */
async function ensureScheduleAvailable(
  recipientUserId: string,
  requestId: string,
  startTime: Date,
  endTime: Date,
  client: PoolClient) {
  const recipientLocked = await MeetingReqRepo.lockRecipientUser(recipientUserId, client);
  if (!recipientLocked)
    throw new ConflictError("El destinatario ya no esta disponible");

  const publicCalendarFound = await MeetingReqRepo.hasPublicCalendarActiveWithClient(recipientUserId, client);
  if (!publicCalendarFound)
    throw new ConflictError("El calendario publico del destinatario ya no esta disponible");

  const recipientTimezoneFound = await MeetingReqRepo.findRecipientTimezoneWithClient(recipientUserId, client);

  const recipientTimezone = (!recipientTimezoneFound || recipientTimezoneFound.length === 0)
    ? "UTC"
    : recipientTimezoneFound[0].timezone;

  if (startTime.getTime() <= Date.now())
    throw new ConflictError("El horario solicitado ya no se encuentra disponible");
  if (endTime <= startTime)
    throw new ConflictError("El intervalo de la solicitud es invalido");

  const startDate = DateUtils.getLocalDate(startTime, recipientTimezone);
  const endDate = DateUtils.getLocalDate(endTime, recipientTimezone);
  const startDay = DateUtils.getLocalWeekDay(startTime, recipientTimezone);
  const endDay = DateUtils.getLocalWeekDay(endTime, recipientTimezone);
  const startHour = DateUtils.getLocalTime(startTime, recipientTimezone);
  const endHour = DateUtils.getLocalTime(endTime, recipientTimezone);
  if (startDay !== endDay || startDate !== endDate)
    throw new ConflictError("La solicitud no puede abarcar mas de un dia");

  const availableSchedules = await MeetingReqRepo.
    findAvailableSchedules(recipientUserId, startDay, startHour, endHour, client);
  if (!availableSchedules || availableSchedules.length === 0)
    throw new ConflictError("El horario solicitado ya no coincide con la disponibilidad del destinatario");

  const scheduledActivities = await MeetingReqRepo.
    findCalendarSchedules(recipientUserId, startTime, endTime, client);
  if (scheduledActivities.length > 0)
    throw new ConflictError("El horario solicitado ya esta ocupado por otra actividad");

  const pendingRequests = await MeetingReqRepo.
    findOtherPendingRequests(recipientUserId, requestId, startTime, endTime, client);
  if (pendingRequests.length > 0)
    throw new ConflictError("Ya existen otras solicitudes pendientes para ese horario");

  return recipientTimezone;
}

function hasSameDecisionSnapshot(
  current: MeetingReqTypes.MeetingRequestDecisionRow,
  original: MeetingReqTypes.MeetingRequestDecisionRow) {
  return (
    current.id === original.id &&
    current.requester_user_id === original.requester_user_id &&
    current.recipient_user_id === original.recipient_user_id &&
    current.requested_start_at.getTime() === original.requested_start_at.getTime() &&
    current.requested_end_at.getTime() === original.requested_end_at.getTime() &&
    current.timezone === original.timezone &&
    current.title === original.title &&
    current.message === original.message
  );
}

function buildEventDescription(message: string | null, counterpart: string | null, meetUrl?: string | null) {
  const lines: string[] = [];
  if (message) lines.push(message);
  if (counterpart) lines.push(`Reunion con: ${counterpart}`);
  if (meetUrl) lines.push(`Enlace de Google Meet: ${meetUrl}`);
  return lines.length > 0 ? lines.join("\n\n") : undefined;
}

function isCalendarConnected(calendar: GoogleCalendarForUser | null): calendar is GoogleCalendarForUser {
  return Boolean(calendar && calendar.connectionStatus === "connected" && calendar.calendarId?.trim());
}

async function compensateGoogleEvent(userId: string, googleEventId: string) {
  try {
    await deleteGoogleEvent(userId, googleEventId);
  } catch {
    throw new ServerError("No se pudo completar la aceptacion y tampoco fue posible eliminar el evento creado en Google Calendar. Revise manualmente su calendario.", 503);
  }
}

export async function decideMeetingRequest(
  userId: string,
  requestId: string,
  decisionInfo: MeetingReqTypes.MeetingRequestDecision): Promise<DecisionResult> {
  try {
    if (decisionInfo.decision === MeetingReqTypes.MeetingRequestStatus.REJECTED) {
      const result = await processTransaction<DecisionResult>(async function (client: PoolClient) {
        const requestFound = await MeetingReqRepo.findRequestForRecipient(requestId, userId, client);
        if (!requestFound || requestFound.length === 0)
          return { result: false, statusCode: 404, message: "Solicitud de reunion no encontrada" };

        const request = requestFound[0];
        if (request.status !== MeetingReqTypes.MeetingRequestStatus.PENDING)
          return { result: false, statusCode: 409, message: "Solo se pueden decidir solicitudes pendientes" };

        const recipientLocked = await MeetingReqRepo.lockRecipientUser(userId, client);
        if (!recipientLocked)
          return { result: false, statusCode: 409, message: "El destinatario ya no esta disponible" };

        const updatedRequest = await MeetingReqRepo.
          updateMeetingRequestDecision(requestId, userId, MeetingReqTypes.MeetingRequestStatus.REJECTED,
            decisionInfo.responseMessage ?? null, null, client);
        if (!updatedRequest || updatedRequest.length === 0)
          return { result: false, statusCode: 409, message: "No se pudo rechazar la solicitud" };

        if (request.requester_user_id !== null) {
          const notification = await MeetingReqRepo.
            createDecisionNotification(request.requester_user_id, userId, requestId,
              MeetingReqTypes.MeetingRequestStatus.REJECTED, client, decisionInfo.responseMessage ?? null);
          if (!notification || notification.length === 0)
            throw new ServerError("Error al crear la notificacion de rechazo");
        }

        const formatedData = Mapper.meetingRequestToResponse(updatedRequest[0]);
        return {
          result: true,
          statusCode: 200,
          message: "Solicitud de reunion rechazada correctamente",
          data: formatedData
        };
      });

      return result;
    }

    const preparation = await processTransaction<DecisionPreparation>(async function (client: PoolClient) {
      const requestFound = await MeetingReqRepo.findRequestForRecipient(requestId, userId, client);
      if (!requestFound || requestFound.length === 0)
        return { result: false, statusCode: 404, message: "Solicitud de reunion no encontrada" };

      const request = requestFound[0];
      if (request.status !== MeetingReqTypes.MeetingRequestStatus.PENDING)
        return { result: false, statusCode: 409, message: "Solo se pueden decidir solicitudes pendientes" };

      const recipientTimezone = await ensureDecisionAvailability(request, client);
      const contact = await MeetingReqRepo.findRequesterContact(requestId, client);
      return {
        result: true,
        request,
        recipientTimezone,
        requesterName: contact[0]?.requester_name ?? null,
        requesterEmail: contact[0]?.requester_email ?? null
      };
    });

    if (!preparation.result)
      return preparation;

    const calendar = await synchronizeCalendarEvents(userId);
    if (!calendar || calendar.connectionStatus !== "connected" || !calendar.calendarId?.trim())
      throw new ConflictError("Google Calendar no esta conectado o requiere autorizacion");

    const pendingRequest = preparation.request;
    const isGuestRequest = pendingRequest.requester_user_id === null;
    const eventInput: CreateCalendarEventInput = {
      title: pendingRequest.title,
      description: buildEventDescription(pendingRequest.message,
        [preparation.requesterName, preparation.requesterEmail].filter(Boolean).join(" - ") || null),
      startsAt: pendingRequest.requested_start_at.toISOString(),
      endsAt: pendingRequest.requested_end_at.toISOString(),
      timeZone: preparation.recipientTimezone,
      isPublic: false,
      withMeet: true,
      attendeeEmails: isGuestRequest && preparation.requesterEmail ? [preparation.requesterEmail] : undefined
    };
    const googleEvent = await createGoogleEvent(userId, eventInput);
    const meetUrl = googleEvent.meetUrl ?? null;

    let requesterCalendar: GoogleCalendarForUser | null = null;
    let requesterEvent: GoogleCalendarEvent | null = null;
    let requesterCopyFailed = false;
    const requesterUserId = pendingRequest.requester_user_id;

    if (requesterUserId !== null) {
      try {
        const calendarFound = await findGoogleCalendarForUser(requesterUserId);
        if (isCalendarConnected(calendarFound)) {
          requesterCalendar = calendarFound;
          requesterEvent = await createGoogleEvent(requesterUserId, {
            title: pendingRequest.title,
            description: buildEventDescription(pendingRequest.message, null, meetUrl),
            location: meetUrl ?? undefined,
            startsAt: pendingRequest.requested_start_at.toISOString(),
            endsAt: pendingRequest.requested_end_at.toISOString(),
            timeZone: pendingRequest.timezone,
            isPublic: false
          });
        }
      } catch {
        requesterCalendar = null;
        requesterEvent = null;
        requesterCopyFailed = true;
      }
    }

    const compensateAll = async () => {
      if (requesterUserId !== null && requesterEvent)
        await compensateGoogleEvent(requesterUserId, requesterEvent.id);
      await compensateGoogleEvent(userId, googleEvent.id);
    };

    let decisionResult: DecisionResult;
    try {
      decisionResult = await processTransaction<DecisionResult>(async function (client: PoolClient) {
        const requestFound = await MeetingReqRepo.findRequestForRecipient(requestId, userId, client);
        if (!requestFound || requestFound.length === 0)
          return { result: false, statusCode: 404, message: "Solicitud de reunion no encontrada" };

        const request = requestFound[0];
        if (request.status !== MeetingReqTypes.MeetingRequestStatus.PENDING)
          return { result: false, statusCode: 409, message: "La solicitud ya fue resuelta" };
        if (!hasSameDecisionSnapshot(request, preparation.request))
          return { result: false, statusCode: 409, message: "La solicitud fue modificada durante la aceptacion" };

        const currentTimezone = await ensureDecisionAvailability(request, client);
        if (currentTimezone !== preparation.recipientTimezone)
          return { result: false, statusCode: 409, message: "La zona horaria del destinatario cambio durante la aceptacion" };

        const info: UpsertCalendarEventMirrorInput = {
          userId,
          calendarConnectionId: calendar.connectionId,
          googleEventId: googleEvent.id,
          googleCalendarId: calendar.calendarId,
          title: googleEvent.title,
          description: googleEvent.description,
          location: googleEvent.location,
          startsAt: googleEvent.startsAt,
          endsAt: googleEvent.endsAt,
          timeZone: googleEvent.timeZone,
          isPublic: false,
          eventStatus: googleEvent.eventStatus,
          syncStatus: "synced",
          providerUpdatedAt: googleEvent.providerUpdatedAt,
          meetUrl
        }
        const calendarEventMirror = await upsertCalendarEventMirror(info, client);

        let requesterMirrorId: string | null = null;
        if (requesterUserId !== null && requesterCalendar && requesterEvent) {
          const requesterMirror = await upsertCalendarEventMirror({
            userId: requesterUserId,
            calendarConnectionId: requesterCalendar.connectionId,
            googleEventId: requesterEvent.id,
            googleCalendarId: requesterCalendar.calendarId,
            title: requesterEvent.title,
            description: requesterEvent.description,
            location: requesterEvent.location,
            startsAt: requesterEvent.startsAt,
            endsAt: requesterEvent.endsAt,
            timeZone: requesterEvent.timeZone,
            isPublic: false,
            eventStatus: requesterEvent.eventStatus,
            syncStatus: "synced",
            providerUpdatedAt: requesterEvent.providerUpdatedAt,
            meetUrl
          }, client);
          requesterMirrorId = requesterMirror.id;
        }

        const updatedRequest = await MeetingReqRepo.
          updateMeetingRequestDecision(requestId, userId, MeetingReqTypes.MeetingRequestStatus.ACCEPTED,
            decisionInfo.responseMessage ?? null, calendarEventMirror.id, client, meetUrl, requesterMirrorId);
        if (!updatedRequest || updatedRequest.length === 0)
          throw new ConflictError("No se pudo registrar la aceptacion de la solicitud");

        if (request.requester_user_id !== null) {
          const notification = await MeetingReqRepo.
            createDecisionNotification(request.requester_user_id, userId, requestId,
              MeetingReqTypes.MeetingRequestStatus.ACCEPTED, client, meetUrl);
          if (!notification || notification.length === 0)
            throw new ServerError("Error al crear la notificacion de aceptacion");
        }

        const formatedData = Mapper.meetingRequestToResponse(updatedRequest[0]);
        return {
          result: true,
          statusCode: 200,
          message: requesterCopyFailed
            ? "Solicitud de reunion aceptada correctamente, pero no se pudo agregar al calendario del solicitante"
            : "Solicitud de reunion aceptada correctamente",
          data: formatedData
        };
      });
    } catch (error) {
      await compensateAll();
      throw error;
    }

    if (!decisionResult.result) {
      await compensateAll();
      return decisionResult;
    }
    return decisionResult;
  } catch (err) {
    if (err instanceof ServerError)
      return { result: false, statusCode: err.statusCode, message: err.message };

    return { result: false, statusCode: 500, message: `Error en el servicio: ${(err as Error).message}` };
  }
}
function formatForNotification(date: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("es-BO", {
      timeZone, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function serviceFailure(err: unknown): DecisionFailure {
  if (err instanceof ServerError)
    return { result: false, statusCode: err.statusCode, message: err.message };
  return { result: false, statusCode: 500, message: `Error en el servicio: ${(err as Error).message}` };
}

type ProposalPreparation =
  | DecisionFailure
  | { result: true; guest: false; data: ReturnType<typeof Mapper.meetingRequestToResponse> }
  | { result: true; guest: true; originalStart: Date; originalEnd: Date };

/**
 * El anfitrion propone otro horario en lugar de rechazar.
 * - Solicitante con cuenta: queda en "reschedule_proposed" hasta que responda.
 * - Visitante sin cuenta: la reunion se confirma directamente en el nuevo horario y Google
 *   Calendar le envia la invitacion por correo (puede aceptarla o rechazarla desde ahi).
 */
export async function proposeReschedule(
  userId: string,
  requestId: string,
  proposal: MeetingReqTypes.RescheduleProposal): Promise<DecisionResult> {
  try {
    const preparation = await processTransaction<ProposalPreparation>(async function (client: PoolClient) {
      const requestFound = await MeetingReqRepo.findRequestForRecipient(requestId, userId, client);
      if (!requestFound || requestFound.length === 0)
        return { result: false, statusCode: 404, message: "Solicitud de reunion no encontrada" };

      const request = requestFound[0];
      if (request.status !== MeetingReqTypes.MeetingRequestStatus.PENDING)
        return { result: false, statusCode: 409, message: "Solo se puede proponer otro horario en solicitudes pendientes" };
      if (request.requested_start_at.getTime() === proposal.startsAt.getTime() &&
        request.requested_end_at.getTime() === proposal.endsAt.getTime())
        return { result: false, statusCode: 400, message: "El nuevo horario debe ser distinto al solicitado" };

      await ensureScheduleAvailable(userId, requestId, proposal.startsAt, proposal.endsAt, client);

      if (request.requester_user_id === null) {
        const moved = await MeetingReqRepo.moveRequestSchedule(requestId, userId, proposal.startsAt, proposal.endsAt, client);
        if (!moved || moved.length === 0)
          return { result: false, statusCode: 409, message: "No se pudo cambiar el horario de la solicitud" };
        return {
          result: true,
          guest: true,
          originalStart: request.requested_start_at,
          originalEnd: request.requested_end_at
        };
      }

      const updated = await MeetingReqRepo.proposeReschedule(requestId, userId,
        proposal.startsAt, proposal.endsAt, proposal.message ?? null, client);
      if (!updated || updated.length === 0)
        return { result: false, statusCode: 409, message: "No se pudo proponer el nuevo horario" };

      const when = formatForNotification(proposal.startsAt, request.timezone);
      const notification = await MeetingReqRepo.createRescheduleNotification(
        request.requester_user_id, userId, requestId, MeetingReqTypes.NotificationType.RESCHEDULED,
        "Nuevo horario propuesto",
        `Te proponen reprogramar "${request.title}" para el ${when}.` +
        (proposal.message ? ` Mensaje: ${proposal.message}` : ""),
        { action: "reschedule_proposed", startsAt: proposal.startsAt, endsAt: proposal.endsAt, message: proposal.message ?? null },
        client);
      if (!notification || notification.length === 0)
        throw new ServerError("Error al crear la notificacion de reprogramacion");

      return { result: true, guest: false, data: Mapper.meetingRequestToResponse(updated[0]) };
    });

    if (!preparation.result) return preparation;
    if (!preparation.guest) {
      return {
        result: true,
        statusCode: 200,
        message: "Nuevo horario propuesto; el solicitante debe confirmarlo",
        data: preparation.data
      };
    }

    const accepted = await decideMeetingRequest(userId, requestId, {
      decision: MeetingReqTypes.MeetingRequestStatus.ACCEPTED,
      ...(proposal.message ? { responseMessage: proposal.message } : {})
    });
    if (!accepted.result) {
      await processTransaction(async function (client: PoolClient) {
        await MeetingReqRepo.moveRequestSchedule(requestId, userId, preparation.originalStart, preparation.originalEnd, client);
      });
      return accepted;
    }
    return {
      ...accepted,
      message: "Reunion confirmada en el nuevo horario; el visitante recibira la invitacion de Google Calendar por correo"
    };
  } catch (err) {
    return serviceFailure(err);
  }
}

/** El solicitante responde a la propuesta del anfitrion: la acepta o propone otro horario. */
export async function respondToProposal(
  userId: string,
  requestId: string,
  response: MeetingReqTypes.ProposalResponse): Promise<DecisionResult> {
  try {
    if (response.decision === MeetingReqTypes.ProposalAnswer.COUNTER) {
      return await processTransaction<DecisionResult>(async function (client: PoolClient) {
        const requestFound = await MeetingReqRepo.findRequestForRequester(requestId, userId, client);
        if (!requestFound || requestFound.length === 0)
          return { result: false, statusCode: 404, message: "Solicitud de reunion no encontrada" };
        const request = requestFound[0];
        if (request.status !== MeetingReqTypes.MeetingRequestStatus.RESCHEDULE_PROPOSED)
          return { result: false, statusCode: 409, message: "La solicitud no tiene una propuesta de horario pendiente" };

        const startsAt = response.startsAt as Date;
        const endsAt = response.endsAt as Date;
        await ensureScheduleAvailable(request.recipient_user_id, requestId, startsAt, endsAt, client);

        const updated = await MeetingReqRepo.counterProposal(requestId, userId, startsAt, endsAt,
          response.timeZone ?? null, client);
        if (!updated || updated.length === 0)
          return { result: false, statusCode: 409, message: "No se pudo proponer el nuevo horario" };

        const when = formatForNotification(startsAt, request.timezone);
        const notification = await MeetingReqRepo.createRescheduleNotification(
          request.recipient_user_id, userId, requestId, MeetingReqTypes.NotificationType.RESCHEDULE_ANSWERED,
          "El solicitante propuso otro horario",
          `Para "${request.title}" el solicitante propone el ${when}.` +
          (response.message ? ` Mensaje: ${response.message}` : ""),
          { action: "counter_proposed", startsAt, endsAt, message: response.message ?? null },
          client);
        if (!notification || notification.length === 0)
          throw new ServerError("Error al crear la notificacion de reprogramacion");

        return {
          result: true,
          statusCode: 200,
          message: "Nuevo horario enviado; la solicitud vuelve a quedar pendiente",
          data: Mapper.meetingRequestToResponse(updated[0])
        };
      });
    }

    const applied = await processTransaction<
      DecisionFailure | { result: true; recipientUserId: string; title: string; original: {
        requestedStart: Date; requestedEnd: Date; proposedStart: Date; proposedEnd: Date; message: string | null;
      } }>(async function (client: PoolClient) {
      const requestFound = await MeetingReqRepo.findRequestForRequester(requestId, userId, client);
      if (!requestFound || requestFound.length === 0)
        return { result: false, statusCode: 404, message: "Solicitud de reunion no encontrada" };
      const request = requestFound[0];
      if (request.status !== MeetingReqTypes.MeetingRequestStatus.RESCHEDULE_PROPOSED ||
        !request.proposed_start_at || !request.proposed_end_at)
        return { result: false, statusCode: 409, message: "La solicitud no tiene una propuesta de horario pendiente" };
      if (new Date(request.proposed_start_at).getTime() <= Date.now())
        return { result: false, statusCode: 409, message: "El horario propuesto ya paso; propone otro horario" };

      const updated = await MeetingReqRepo.applyProposal(requestId, userId, client);
      if (!updated || updated.length === 0)
        return { result: false, statusCode: 409, message: "No se pudo aceptar la propuesta" };

      return {
        result: true,
        recipientUserId: request.recipient_user_id,
        title: request.title,
        original: {
          requestedStart: request.requested_start_at,
          requestedEnd: request.requested_end_at,
          proposedStart: request.proposed_start_at,
          proposedEnd: request.proposed_end_at,
          message: request.proposal_message ?? null
        }
      };
    });
    if (!applied.result) return applied;

    const accepted = await decideMeetingRequest(applied.recipientUserId, requestId, {
      decision: MeetingReqTypes.MeetingRequestStatus.ACCEPTED
    });
    if (!accepted.result) {
      await processTransaction(async function (client: PoolClient) {
        await MeetingReqRepo.restoreProposal(requestId, applied.original, client);
      });
      return accepted;
    }

    try {
      await processTransaction(async function (client: PoolClient) {
        await MeetingReqRepo.createRescheduleNotification(
          applied.recipientUserId, userId, requestId, MeetingReqTypes.NotificationType.RESCHEDULE_ANSWERED,
          "Nuevo horario aceptado",
          `El solicitante acepto el nuevo horario de "${applied.title}". La reunion ya esta en tu calendario.`,
          { action: "proposal_accepted" },
          client);
      });
    } catch {
      // La reunion ya quedo confirmada; la notificacion al anfitrion es informativa.
    }

    return { ...accepted, message: "Nuevo horario aceptado; la reunion quedo confirmada" };
  } catch (err) {
    return serviceFailure(err);
  }
}
