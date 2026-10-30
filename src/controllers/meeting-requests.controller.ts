import { Request, Response } from "express";
import * as TokenTypes from "../types/token.types";
import * as GeneralValidations from "../validators/general.validator";
import * as MeetingReqService from "../services/meeting-requests.service";

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