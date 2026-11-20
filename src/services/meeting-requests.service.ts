import { processTransaction } from "../utils/query";
import { PoolClient } from "pg";
import * as MeetingReqTypes from "../types/meeting-requests.types";
import * as ProfileRepo from "../repositories/profile.repository";
import * as MeetingReqRepo from "../repositories/meeting-requests.repository";
import * as Mapper from "../helpers/mapper.helper";
import * as DateUtils from "../utils/date";
import { ServerError, ConflictError } from "../helpers/errors.helper";
import {
  upsertCalendarEventMirror,
  findGoogleCalendarForUser,
  deleteCalendarEventMirror
} from "../repositories/calendarEvents.repository";

import {
  createGoogleEvent,
  deleteGoogleEvent,
  GoogleCalendarClientError
} from "./googleCalendarClient.service";
import type {
  CreateCalendarEventInput,
  GoogleCalendarForUser,
  GoogleCalendarEvent
} from "../types/calendarEvents.types";
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

export async function cancelMeetingRequest(
  userId: string,
  requestId: string,
  reason: string
) {
  try {
    const ans = await processTransaction(async function (
      client: PoolClient
    ) {
      const requestFound =
        await MeetingReqRepo.findRequestForParticipant(
          requestId,
          userId,
          client
        );

      if (!requestFound || requestFound.length === 0) {
        return {
          result: false,
          statusCode: 404,
          message: "Solicitud de reunión no encontrada"
        };
      }

      const request = requestFound[0];

      const isRequester =
        request.requester_user_id === userId;

      const isPending =
        request.status === MeetingReqTypes.MeetingRequestStatus.PENDING;

      const isAccepted =
        request.status === MeetingReqTypes.MeetingRequestStatus.ACCEPTED;

      if (!isPending && !isAccepted) {
        return {
          result: false,
          statusCode: 409,
          message: "Esta solicitud ya fue resuelta y no puede cancelarse nuevamente"
        };
      }

      if (isPending && !isRequester) {
        return {
          result: false,
          statusCode: 409,
          message: "Solo el solicitante puede retirar una solicitud pendiente"
        };
      }

      const eventsToDelete = isAccepted
        ? [
            {
              userId: request.host_event_user_id,
              googleEventId: request.host_google_event_id,
              mirrorId: request.calendar_event_id
            },
            {
              userId: request.requester_event_user_id,
              googleEventId: request.requester_google_event_id,
              mirrorId: request.requester_calendar_event_id
            }
          ].filter(
            event =>
              event.userId &&
              event.googleEventId
          )
        : [];

      // Primero se eliminan los eventos externos.
      // Si Google ya no encuentra uno, se considera eliminado.
      for (const event of eventsToDelete) {
        try {
          await deleteGoogleEvent(
            event.userId,
            event.googleEventId
          );
        } catch (error) {
          if (
            error instanceof GoogleCalendarClientError &&
            error.code === "google_event_not_found"
          ) {
            continue;
          }

          throw new ServerError(
            "No se pudieron eliminar todos los eventos de Google Calendar. La reunión sigue confirmada; vuelve a intentarlo.",
            503
          );
        }
      }

      const cancelledRequest =
        await MeetingReqRepo.cancelMeetingRequest(
          requestId,
          userId,
          reason,
          request.status,
          client
        );

      if (!cancelledRequest || cancelledRequest.length === 0) {
        return {
          result: false,
          statusCode: 409,
          message: "No se pudo cancelar la solicitud porque su estado cambió"
        };
      }

      // Eliminar los espejos locales de ambos calendarios.
      for (const event of eventsToDelete) {
        if (event.mirrorId) {
          await deleteCalendarEventMirror(
            event.userId,
            event.mirrorId,
            client
          );
        }
      }

      // Notificar al otro participante.
      const otherParticipantId = isRequester
        ? request.recipient_user_id
        : request.requester_user_id;

      if (otherParticipantId) {
        const notification =
          await MeetingReqRepo.createCancelNotification(
            otherParticipantId,
            userId,
            requestId,
            request.title,
            reason,
            client,
            isAccepted
          );

        if (!notification || notification.length === 0) {
          throw new ServerError(
            "Error al crear la notificación de cancelación"
          );
        }
      }

      const formattedData =
        Mapper.meetingRequestToResponse(cancelledRequest[0]);

      return {
        result: true,
        statusCode: 200,
        message: isAccepted
          ? "Reunión cancelada correctamente"
          : "Solicitud retirada correctamente",
        data: formattedData
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

    return {
      result: false,
      statusCode: 500,
      message: `Error en el servicio: ${(err as Error).message}`
    };
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

function buildEventDescription(
  message: string | null,
  counterpart: string | null,
  meetUrl?: string | null
) {
  const lines: string[] = [];

  if (message) lines.push(message);
  if (counterpart) lines.push(`Reunion con: ${counterpart}`);
  if (meetUrl) lines.push(`Enlace de Google Meet: ${meetUrl}`);

  return lines.length > 0 ? lines.join("\n\n") : undefined;
}

function isCalendarConnected(
  calendar: GoogleCalendarForUser | null
): calendar is GoogleCalendarForUser {
  return Boolean(
    calendar &&
    calendar.connectionStatus === "connected" &&
    calendar.calendarId?.trim()
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
  decisionInfo: MeetingReqTypes.MeetingRequestDecision
): Promise<DecisionResult> {
  try {
    // El rechazo no necesita crear eventos en Google Calendar.
    if (decisionInfo.decision === MeetingReqTypes.MeetingRequestStatus.REJECTED) {
      return await processTransaction<DecisionResult>(async function (client: PoolClient) {
        const requestFound = await MeetingReqRepo.findRequestForRecipient(
          requestId,
          userId,
          client
        );

        if (!requestFound || requestFound.length === 0) {
          return {
            result: false,
            statusCode: 404,
            message: "Solicitud de reunion no encontrada"
          };
        }

        const request = requestFound[0];

        if (request.status !== MeetingReqTypes.MeetingRequestStatus.PENDING) {
          return {
            result: false,
            statusCode: 409,
            message: "Solo se pueden decidir solicitudes pendientes"
          };
        }

        const recipientLocked = await MeetingReqRepo.lockRecipientUser(
          userId,
          client
        );

        if (!recipientLocked) {
          return {
            result: false,
            statusCode: 409,
            message: "El destinatario ya no esta disponible"
          };
        }

        const updatedRequest = await MeetingReqRepo.updateMeetingRequestDecision(
          requestId,
          userId,
          MeetingReqTypes.MeetingRequestStatus.REJECTED,
          decisionInfo.responseMessage ?? null,
          null,
          client
        );

        if (!updatedRequest || updatedRequest.length === 0) {
          return {
            result: false,
            statusCode: 409,
            message: "No se pudo rechazar la solicitud"
          };
        }

        if (request.requester_user_id !== null) {
          const notification = await MeetingReqRepo.createDecisionNotification(
            request.requester_user_id,
            userId,
            requestId,
            MeetingReqTypes.MeetingRequestStatus.REJECTED,
            client,
            decisionInfo.responseMessage ?? null
          );

          if (!notification || notification.length === 0) {
            throw new ServerError("Error al crear la notificacion de rechazo");
          }
        }

        return {
          result: true,
          statusCode: 200,
          message: "Solicitud de reunion rechazada correctamente",
          data: Mapper.meetingRequestToResponse(updatedRequest[0])
        };
      });
    }

    // Primera transaccion: comprobar disponibilidad y recuperar datos.
    const preparation = await processTransaction<DecisionPreparation>(
      async function (client: PoolClient) {
        const requestFound = await MeetingReqRepo.findRequestForRecipient(
          requestId,
          userId,
          client
        );

        if (!requestFound || requestFound.length === 0) {
          return {
            result: false,
            statusCode: 404,
            message: "Solicitud de reunion no encontrada"
          };
        }

        const request = requestFound[0];

        if (request.status !== MeetingReqTypes.MeetingRequestStatus.PENDING) {
          return {
            result: false,
            statusCode: 409,
            message: "Solo se pueden decidir solicitudes pendientes"
          };
        }

        const recipientTimezone = await ensureDecisionAvailability(
          request,
          client
        );

        const contact = await MeetingReqRepo.findRequesterContact(
          requestId,
          client
        );

        return {
          result: true,
          request,
          recipientTimezone,
          requesterName: contact[0]?.requester_name ?? null,
          requesterEmail: contact[0]?.requester_email ?? null
        };
      }
    );

    if (!preparation.result) return preparation;

    // El calendario del anfitrion es obligatorio para aceptar.
    const calendar = await synchronizeCalendarEvents(userId);

    if (
      !calendar ||
      calendar.connectionStatus !== "connected" ||
      !calendar.calendarId?.trim()
    ) {
      throw new ConflictError(
        "Google Calendar no esta conectado o requiere autorizacion"
      );
    }

    const pendingRequest = preparation.request;
    const isGuestRequest = pendingRequest.requester_user_id === null;

    // Crear evento principal y conferencia Meet.
    const eventInput: CreateCalendarEventInput = {
      title: pendingRequest.title,
      description: buildEventDescription(
        pendingRequest.message,
        [preparation.requesterName, preparation.requesterEmail]
          .filter(Boolean)
          .join(" - ") || null
      ),
      startsAt: pendingRequest.requested_start_at.toISOString(),
      endsAt: pendingRequest.requested_end_at.toISOString(),
      timeZone: preparation.recipientTimezone,
      isPublic: false,
      withMeet: true,
      attendeeEmails:
        isGuestRequest && preparation.requesterEmail
          ? [preparation.requesterEmail]
          : undefined
    };

    const googleEvent = await createGoogleEvent(userId, eventInput);
    const meetUrl = googleEvent.meetUrl ?? null;

    // Crear copia en el calendario del solicitante si tiene uno conectado.
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
            description: buildEventDescription(
              pendingRequest.message,
              null,
              meetUrl
            ),
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
      if (requesterUserId !== null && requesterEvent) {
        await compensateGoogleEvent(requesterUserId, requesterEvent.id);
      }

      await compensateGoogleEvent(userId, googleEvent.id);
    };

    // Segunda transaccion: guardar los espejos y aceptar la solicitud.
    let decisionResult: DecisionResult;

    try {
      decisionResult = await processTransaction<DecisionResult>(
        async function (client: PoolClient) {
          const requestFound = await MeetingReqRepo.findRequestForRecipient(
            requestId,
            userId,
            client
          );

          if (!requestFound || requestFound.length === 0) {
            return {
              result: false,
              statusCode: 404,
              message: "Solicitud de reunion no encontrada"
            };
          }

          const request = requestFound[0];

          if (request.status !== MeetingReqTypes.MeetingRequestStatus.PENDING) {
            return {
              result: false,
              statusCode: 409,
              message: "La solicitud ya fue resuelta"
            };
          }

          if (!hasSameDecisionSnapshot(request, preparation.request)) {
            return {
              result: false,
              statusCode: 409,
              message: "La solicitud fue modificada durante la aceptacion"
            };
          }

          const currentTimezone = await ensureDecisionAvailability(
            request,
            client
          );

          if (currentTimezone !== preparation.recipientTimezone) {
            return {
              result: false,
              statusCode: 409,
              message: "La zona horaria del destinatario cambio durante la aceptacion"
            };
          }

          const calendarEventMirror = await upsertCalendarEventMirror({
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
          }, client);

          let requesterMirrorId: string | null = null;

          if (
            requesterUserId !== null &&
            requesterCalendar &&
            requesterEvent
          ) {
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

          const updatedRequest =
            await MeetingReqRepo.updateMeetingRequestDecision(
              requestId,
              userId,
              MeetingReqTypes.MeetingRequestStatus.ACCEPTED,
              decisionInfo.responseMessage ?? null,
              calendarEventMirror.id,
              client,
              meetUrl,
              requesterMirrorId
            );

          if (!updatedRequest || updatedRequest.length === 0) {
            throw new ConflictError(
              "No se pudo registrar la aceptacion de la solicitud"
            );
          }

          if (requesterUserId !== null) {
            const notification =
              await MeetingReqRepo.createDecisionNotification(
                requesterUserId,
                userId,
                requestId,
                MeetingReqTypes.MeetingRequestStatus.ACCEPTED,
                client,
                meetUrl
              );

            if (!notification || notification.length === 0) {
              throw new ServerError(
                "Error al crear la notificacion de aceptacion"
              );
            }
          }

          return {
            result: true,
            statusCode: 200,
            message: requesterCopyFailed
              ? "Solicitud aceptada, pero no se pudo agregar al calendario del solicitante"
              : "Solicitud de reunion aceptada correctamente",
            data: Mapper.meetingRequestToResponse(updatedRequest[0])
          };
        }
      );
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
    if (err instanceof ServerError) {
      return {
        result: false,
        statusCode: err.statusCode,
        message: err.message
      };
    }

    return {
      result: false,
      statusCode: 500,
      message: `Error en el servicio: ${(err as Error).message}`
    };
  }
}