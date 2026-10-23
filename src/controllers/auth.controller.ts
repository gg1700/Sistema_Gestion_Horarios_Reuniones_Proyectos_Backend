import { Request, Response } from "express";
import * as TokenTypes from "../types/token.types";
import * as GeneralValidations from "../validators/general.validator";
import * as AuthService from "../services/auth.service";

export async function viewAccountVinculation(req: Request, res: Response) {
  try {
    const { userId } = req.user as TokenTypes.TokenPayload || req.query;
    const validatedUserId = GeneralValidations.validateId(userId);

    const { result, statusCode, message, data } = await AuthService.viewAccountVinculation(validatedUserId);
    if (!result) return res.status(statusCode).json({ success: result, message: message });
    return res.status(200).json({
      success: true,
      message: message,
      data: data
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor: ${(err as Error).message}`
    });
  }
}