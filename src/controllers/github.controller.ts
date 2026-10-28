import { Request, Response } from "express";
import * as TokenTypes from "../types/token.types";
import * as GeneralValidations from "../validators/general.validator";
import * as GithubService from "../services/github.service";

export async function requestGithubActivity(req: Request, res: Response) {
  try {
    const { userId } = req.user as TokenTypes.TokenPayload || req.query;
    const validatedUserId = GeneralValidations.validateId(userId);
    const { type: activityType } = req.params;

    if (activityType !== "list" && activityType !== "grid") {
      return res.status(400).json({
        success: false,
        message: "Parametro de tipo de actividad de GitHub invalido",
      });
    }

    const { result, statusCode, message, data } = await GithubService.requestGithubActivity(validatedUserId, activityType);
    if (!result) return res.status(statusCode).json({ success: false, message: message });

    return res.status(200).json({ success: true, message: message, data: data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor ${(err as Error).message}`,
    });
  }  
}