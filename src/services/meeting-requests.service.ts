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
import type { CreateCalendarEventInput } from "../types/calendarEvents.types";
import type { UpsertCalendarEventMirrorInput } from "../repositories/calendarEvents.repository";

export async function createMeetingRequest(userId: string, meetingReqInfo: MeetingReqTypes.MeetingRequest) {
  try {
    const userFound = await ProfileRepo.existsUser(userId);
    if (!userFound) return { result: false, statusCode: 404, message: "El usuario no existe" };

    const formatedInfo = Mapper.meetingReqInfoToDB(meetingReqInfo);

    const recipientHandle = formatedInfo.recipient_handle;
    const recipientUserFound = await MeetingReqRepo.findRecipientUserByHandle(recipientHandle);
    if (!recipientUserFound || recipientUserFound.length === 0)
      return { result: false, statusCode: 404, message: "El usuario solicitado no existe" };

    const recipientUserId = recipientUserFound[0].id;
    if (recipientUserId === userId)
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

      const availableSchedules = await MeetingReqRepo.
        findAvailableSchedules(recipientUserId, startDay, startHour, endHour, client);
      if (!availableSchedules || availableSchedules.length === 0) {
        return {
          result: false,
          statusCode: 409,
          message: "El horario solicitado no coincide con la disponibilidad del destinatario"
        };
      }

      const scheduledActivities = await MeetingReqRepo.findCalendarSchedules(recipientUserId, startTime, endTime, client);
      if (scheduledActivities.length > 0) {
        return { result: false, statusCode: 409, message: "El horario solicitado esta ocupado por otra actividad" };
      }

      const pendingRequests = await MeetingReqRepo.
        findOtherPendingRequests(recipientUserId, requestId, startTime, endTime, client);
      if (pendingRequests.length > 0)
        return { result: false, statusCode: 409, message: "Ya existen solicitudes pendientes para ese horario" };

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

export async function cancelMeetingRequest(userId: string, requestId: string) {
  try {
    const ans = await processTransaction(async function (client: PoolClient) {
      const requestFound = await MeetingReqRepo.findRequestForRequester(requestId, userId, client);
      if (!requestFound || requestFound.length === 0)
        return { result: false, statusCode: 404, message: "Solicitud de reunion no encontrada" };

      const request = requestFound[0];
      if (request.status !== MeetingReqTypes.MeetingRequestStatus.PENDING)
        return { result: false, statusCode: 409, message: "Solo se pueden cancelar solicitudes pendientes" };

      const cancelledRequest = await MeetingReqRepo.cancelPendingRequest(requestId, userId, client);
      if (!cancelledRequest || cancelledRequest.length === 0) {
        return {
          result: false,
          statusCode: 409,
          message: "No se pudo cancelar la solicitud; puede que ya no este pendiente"
        };
      }

      const notification = await MeetingReqRepo.
        createCancelNotification(request.recipient_user_id, userId, requestId, request.title, client);
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
  };

async function ensureDecisionAvailability(
  request: MeetingReqTypes.MeetingRequestDecisionRow,
  client: PoolClient) {
  const recipientUserId = request.recipient_user_id;
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
  const startTime = request.requested_start_at;
  const endTime = request.requested_end_at;

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
    findOtherPendingRequests(recipientUserId, request.id, startTime, endTime, client);
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

        const notification = await MeetingReqRepo.
          createDecisionNotification(request.requester_user_id, userId, requestId,
            MeetingReqTypes.MeetingRequestStatus.REJECTED, client);
        if (!notification || notification.length === 0)
          throw new ServerError("Error al crear la notificacion de rechazo");

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
      return { result: true, request, recipientTimezone };
    });

    if (!preparation.result)
      return preparation;

    const calendar = await findGoogleCalendarForUser(userId);
    if (!calendar || calendar.connectionStatus !== "connected" || !calendar.calendarId?.trim())
      throw new ConflictError("Google Calendar no esta conectado o requiere autorizacion");

    const eventInput: CreateCalendarEventInput = {
      title: preparation.request.title,
      description: preparation.request.message ?? undefined,
      startsAt: preparation.request.requested_start_at.toISOString(),
      endsAt: preparation.request.requested_end_at.toISOString(),
      timeZone: preparation.recipientTimezone,
      isPublic: false
    };
    const googleEvent = await createGoogleEvent(userId, eventInput);

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
          providerUpdatedAt: googleEvent.providerUpdatedAt
        }
        const calendarEventMirror = await upsertCalendarEventMirror(info, client);
        const updatedRequest = await MeetingReqRepo.
          updateMeetingRequestDecision(requestId, userId, MeetingReqTypes.MeetingRequestStatus.ACCEPTED,
            decisionInfo.responseMessage ?? null, calendarEventMirror.id, client);
        if (!updatedRequest || updatedRequest.length === 0)
          throw new ConflictError("No se pudo registrar la aceptacion de la solicitud");

        const notification = await MeetingReqRepo.
          createDecisionNotification(request.requester_user_id, userId, requestId,
            MeetingReqTypes.MeetingRequestStatus.ACCEPTED, client);
        if (!notification || notification.length === 0)
          throw new ServerError("Error al crear la notificacion de aceptacion");

        const formatedData = Mapper.meetingRequestToResponse(updatedRequest[0]);
        return {
          result: true,
          statusCode: 200,
          message: "Solicitud de reunion aceptada correctamente",
          data: formatedData
        };
      });
    } catch (error) {
      await compensateGoogleEvent(userId, googleEvent.id);
      throw error;
    }

    if (!decisionResult.result) {
      await compensateGoogleEvent(userId, googleEvent.id);
      return decisionResult;
    }
    return decisionResult;
  } catch (err) {
    if (err instanceof ServerError)
      return { result: false, statusCode: err.statusCode, message: err.message };

    return { result: false, statusCode: 500, message: `Error en el servicio: ${(err as Error).message}` };
  }
}