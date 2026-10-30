import { processTransaction } from "../utils/query";
import { PoolClient } from "pg";
import * as MeetingReqTypes from "../types/meeting-requests.types";
import * as ProfileRepo from "../repositories/profile.repository";
import * as MeetingReqRepo from "../repositories/meeting-requests.repository";
import * as Mapper from "../helpers/mapper.helper";
import * as DateUtils from "../utils/date";
import { ServerError } from "../helpers/errors.helper";

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
      return { result: false, statusCode: 400, message: "La fecha de inicio debe ser futura"};
    if (formatedInfo.requested_end_at <= formatedInfo.requested_start_at)
      return { result: false, statusCode: 400, message: "La fecha de finalización debe ser posterior al inicio"};

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