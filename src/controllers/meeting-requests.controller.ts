import { Request, Response } from "express";
import * as TokenTypes from "../types/token.types";
import * as GeneralValidations from "../validators/general.validator";
import * as MeetingReqService from "../services/meeting-requests.service";
import * as MeetingReqTypes from "../types/meeting-requests.types";
import { ServerError } from "../helpers/errors.helper";
import * as MeetingReqValidation from "../validators/meeting-requests.validator";

export async function createMeetingRequest(req: Request, res: Response) {
  try {
    const { userId } = req.user as TokenTypes.TokenPayload;
    const validatedUserId = GeneralValidations.validateId(userId);

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Infomacion a modificar no especificada",
      });
    }

    const { result, statusCode, message, data } = await MeetingReqService.createMeetingRequest(validatedUserId, req.body);
    if (!result) return res.status(statusCode).json({ success: false, message: message });

    return res.status(statusCode).json({
      success: true,
      message: message,
      data: data
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor ${(err as Error).message}`
    });
  }
}

export async function listSentMeetingRequests(req: Request, res: Response) {
  try {
    const { userId } = req.user as TokenTypes.TokenPayload;
    const validatedUserId = GeneralValidations.validateId(userId);
    const { action: actionType } = req.params;
    const { status, page, limit } = req.query;

    if (actionType !== "sent" && actionType !== "received") {
      return res.status(400).json({
        success: false,
        message: "Parametro de accion para listar solicitudes de reunion invalido",
      });
    }
    if ((status !== undefined) && (typeof status !== "string" ||
      !Object.values(MeetingReqTypes.MeetingRequestStatus).includes(status as MeetingReqTypes.MeetingRequestStatus))) {
      return res.status(400).json({ success: false, message: "Valor de estado invalido" });
    }
    let parsedPage = undefined;
    if (page !== undefined) {
      if (typeof page !== "string")
        return res.status(400).json({ success: false, message: "Valor de paginacion invalido" });
      parsedPage = Number(page);
      if (!Number.isSafeInteger(parsedPage) || parsedPage <= 0)
        return res.status(400).json({ success: false, message: "Valor de paginacion invalido" });
    }
    let parsedLimit = undefined;
    if (limit !== undefined) {
      if (typeof limit !== "string")
        return res.status(400).json({ success: false, message: "Valor de limite de paginacion invalido" });
      parsedLimit = Number(limit);
      if (!Number.isSafeInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 100)
        return res.status(400).json({ success: false, message: "Valor de limite de paginacion invalido" });   
    }
    
    const { result, statusCode, message, data } = await MeetingReqService.
      listSentMeetingRequests(validatedUserId, actionType, status, parsedPage, parsedLimit);
    if (!result) return res.status(statusCode).json({ success: false, message: message });
    
    return res.status(200).json({ success: true, message: message, data: data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor ${(err as Error).message}`
    });
  }
}

export async function updateMeetingRequest(req: Request, res: Response) {
  try {
    const { userId } = req.user as TokenTypes.TokenPayload;
    const validatedUserId = GeneralValidations.validateId(userId);
    const requestId = MeetingReqValidation.validateMeetingRequestId(req.params.requestId);

    const { result, statusCode, message, data } = await MeetingReqService.
      updateMeetingRequest(validatedUserId, requestId, req.body);
    if (!result) return res.status(statusCode).json({ success: false, message: message });

    return res.status(statusCode).json({ success: true, message: message, data: data });
  } catch (err) {
    const statusCode = err instanceof ServerError ? err.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      message: (statusCode === 500) ? "Error interno del servidor" : (err as Error).message
    });
  }
}