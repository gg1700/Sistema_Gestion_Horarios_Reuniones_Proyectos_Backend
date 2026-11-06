import type { Request, Response } from "express";
import { ServerError, ValidationError } from "../helpers/errors.helper";
import * as service from "../services/availabilityRules.service";
import { validateAvailabilityRulesBody } from "../validators/availabilityRules.validator";

function sendError(res: Response, error: unknown): void {
  if (error instanceof ServerError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: "No se pudo gestionar la disponibilidad",
  });
}

export async function getAvailabilityRules(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Sesion no disponible",
      });
      return;
    }

    const hasBody =
      req.body !== undefined ||
      Number(req.headers["content-length"] ?? 0) > 0 ||
      req.headers["transfer-encoding"] !== undefined;

    if (Object.keys(req.query).length > 0 || hasBody) {
      throw new ValidationError(
        "Esta consulta no acepta parametros ni cuerpo",
      );
    }

    const data = await service.getAvailabilityRules(userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
}

export async function replaceAvailabilityRules(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Sesion no disponible",
      });
      return;
    }

    if (Object.keys(req.query).length > 0) {
      throw new ValidationError("Esta solicitud no acepta parametros");
    }

    const input = validateAvailabilityRulesBody(req.body);
    const data = await service.replaceAvailabilityRules(userId, input);

    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
}