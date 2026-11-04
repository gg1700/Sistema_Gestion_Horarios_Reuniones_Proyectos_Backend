import type { Request, Response } from "express";
import {
  AuthenticationError,
  NotFoundError,
  ValidationError,
} from "../helpers/errors.helper";
import * as service from "../services/publicCalendarLink.service";
import { validatePublicCalendarLinkPatch } from "../validators/publicCalendarLink.validator";

function sessionUserId(req: Request): string {
  const userId = req.user?.userId;
  if (!userId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new AuthenticationError("Sesión inválida");
  }
  return userId;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof AuthenticationError ||
      error instanceof ValidationError ||
      error instanceof NotFoundError) {
    res.status(error.statusCode).json({ success: false, message: error.message });
    return;
  }

  res.status(500).json({
    success: false,
    message: "No se pudo gestionar el enlace público del calendario",
  });
}

export async function getPublicCalendarLink(req: Request, res: Response): Promise<void> {
  try {
    const userId = sessionUserId(req);
    const hasBody =
      req.body !== undefined ||
      Number(req.headers["content-length"] ?? 0) > 0 ||
      req.headers["transfer-encoding"] !== undefined;

    if (Object.keys(req.query).length > 0 || hasBody) {
      throw new ValidationError("Esta consulta no acepta parámetros ni cuerpo");
    }

    const data = await service.getPublicCalendarLink(userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
}

export async function updatePublicCalendarLink(req: Request, res: Response): Promise<void> {
  try {
    const userId = sessionUserId(req);
    if (Object.keys(req.query).length > 0) {
      throw new ValidationError("Esta solicitud no acepta parámetros");
    }

    const active = validatePublicCalendarLinkPatch(req.body);
    const data = await service.updatePublicCalendarLink(userId, active);
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
}
