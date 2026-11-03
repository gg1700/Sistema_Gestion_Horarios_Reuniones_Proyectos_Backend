import type { Request, Response } from "express";
import { ServerError } from "../helpers/errors.helper";
import * as service from "../services/notifications.service";
import { validateNotificationId, validateNotificationListQuery } from "../validators/notifications.validator";

function sendError(res: Response, error: unknown): void {
  if (
    error instanceof ServerError &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  ) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: "Error interno del servidor"
  });
}

export async function listNotifications(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: "Sesion no disponible" });
      return;
    }

    const filters = validateNotificationListQuery(req.query);
    const data = await service.listNotifications(userId, filters);
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
}

export async function markNotificationAsRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: "Sesion no disponible" });
      return;
    }

    if (
      Object.keys(req.query).length > 0 ||
      req.body !== undefined ||
      Number(req.headers["content-length"] ?? 0) > 0 ||
      req.headers["transfer-encoding"] !== undefined
    ) {
      res.status(400).json({ success: false, message: "Esta operacion no acepta parametros ni cuerpo" });
      return;
    }

    const notificationId = validateNotificationId(req.params.notificationId);
    const data = await service.markNotificationAsRead(userId, notificationId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
}
