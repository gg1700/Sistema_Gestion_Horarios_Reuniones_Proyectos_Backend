import { Request, Response } from "express";
import * as ProfileService from "../services/profile.service";
import * as TokenTypes from "../types/token.types";

export async function modifyPersonalInfo(req: Request, res: Response) {
  try {
    const { userId } = req.user as TokenTypes.TokenPayload || req.query;

    if ((!req.body || Object.keys(req.body).length === 0) && !req.file) {
      return res.status(400).json({
        success: false,
        message: "Imagen de perfil invalida o no especificadad para modificar"
      });
    }
    
    const { result, statusCode, message } = await ProfileService.modifyPersonalInfo(userId, req.body, req.file);
    if (!result) {
      return res.status(statusCode).json({ success: result, message: message });
    }
    return res.status(200).json({
      success: true,
      message: "Informacion personal modificada correctamente"
    })
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor ${(err as Error).message}`
    });
  }
}