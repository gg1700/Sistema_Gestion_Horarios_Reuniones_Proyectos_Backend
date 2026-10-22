import { Request, Response } from "express";
import * as GeneralValidations from "../validators/general.validator";
import * as ProfileService from "../services/profile.service";
import * as TokenTypes from "../types/token.types";

export async function modifyPersonalInfo(req: Request, res: Response) {
  try {
    const { userId } = req.user as TokenTypes.TokenPayload || req.query;

    if ((!req.body || Object.keys(req.body).length === 0) && !req.file) {
      return res.status(400).json({
        success: false,
        message: "Infomacion a modificar no especificada"
      });
    }
    
    const { result, statusCode, message } = await ProfileService.modifyPersonalInfo(userId, req.body, req.file);
    if (!result) {
      return res.status(statusCode).json({ success: result, message: message });
    }
    return res.status(200).json({
      success: true,
      message: "Informacion personal modificada correctamente"
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor ${(err as Error).message}`
    });
  }
}

export async function modifyWorkExperience(req: Request, res: Response) {
  try {
    const { userId } = req.user as TokenTypes.TokenPayload || req.query;
    const id = req.params.id;
    
    const validatedUserId = GeneralValidations.validateId(userId);
    const validatedId = GeneralValidations.validateId(id);

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Infomacion a modificar no especificada"
      });
    }

    const { result, statusCode, message } = await ProfileService.modifyWorkExperience(validatedId, validatedUserId, req.body);
    if (!result) {
      return res.status(statusCode).json({ success: result, message: message });
    }
    return res.status(200).json({
      success: true,
      message: "Informacion personal modificada correctamente"
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor: ${(err as Error).message}`
    });
  }
}