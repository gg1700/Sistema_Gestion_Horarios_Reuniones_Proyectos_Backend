import { Request, Response } from "express";
import * as TokenTypes from "../types/token.types";
import * as GeneralValidations from "../validators/general.validator";
import * as MeetingReqService from "../services/meeting-requests.service";
import * as MeetingReqTypes from "../types/meeting-requests.types";

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
    const { status, page, limit } = req.query;

    if (status && (typeof status !== "string" ||
      Object.values(MeetingReqTypes.MeetingRequestStatus).includes(status as MeetingReqTypes.MeetingRequestStatus))) {
      return res.status(400).json({ success: false, message: "Valor de estado invalido" });
    }
    if (page || typeof page !== "number")
      return res.status(400).json({ success: false, message: "Valor de paginacion invalido" });
    if (limit || typeof limit !== "number")
      return res.status(400).json({ success: false, message: "Valor de limite de paginacion invalido" });
    
    const { result, statusCode, message, data } = await MeetingReqService.
      listSentMeetingRequests(validatedUserId, status, page, limit);
    if (!result) return res.status(statusCode).json({ success: false, message: message });
    
    return res.status(200).json({ success: true, message: message, data: data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor ${(err as Error).message}`
    });
  }
}