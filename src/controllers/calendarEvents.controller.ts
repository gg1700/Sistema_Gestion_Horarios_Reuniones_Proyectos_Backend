import type { Request, Response } from "express";
import { ServerError, ValidationError } from "../helpers/errors.helper";
import * as CalendarEventsService from "../services/calendarEvents.service";
import {
  validateCalendarEventId,
  validateCalendarEventRangeQuery,
  validateCreateCalendarEventBody,
  validateUpdateCalendarEventBody,
} from "../validators/calendarEvents.validator";

function sendError(res: Response, error: unknown): void {
  if (error instanceof ServerError) {
    const message = error.statusCode >= 500
      ? "No se pudo procesar la solicitud de calendario"
      : error.message;

    res.status(error.statusCode).json({
      success: false,
      message,
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: "Error interno al gestionar eventos de calendario",
  });
}

function getUserId(req: Request): string | null {
  return req.user?.userId ?? null;
}

function hasBody(req: Request): boolean {
  return req.body !== undefined ||
    Number(req.headers["content-length"] ?? 0) > 0 ||
    req.headers["transfer-encoding"] !== undefined;
}

function rejectQuery(req: Request): void {
  if (Object.keys(req.query).length > 0) {
    throw new ValidationError("Esta solicitud no acepta parametros");
  }
}

function rejectBody(req: Request): void {
  if (hasBody(req)) {
    throw new ValidationError("Esta solicitud no acepta cuerpo");
  }
}

export async function listCalendarEvents(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Sesion no disponible",
      });
      return;
    }

    rejectBody(req);

    const query = validateCalendarEventRangeQuery(req.query);
    const data = await CalendarEventsService.listCalendarEvents(
      userId,
      query,
    );

    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
}

export async function createCalendarEvent(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Sesion no disponible",
      });
      return;
    }

    rejectQuery(req);

    const input = validateCreateCalendarEventBody(req.body);
    const data = await CalendarEventsService.createCalendarEvent(
      userId,
      input,
    );

    res.status(201).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
}

export async function updateCalendarEvent(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Sesion no disponible",
      });
      return;
    }

    rejectQuery(req);

    const eventId = validateCalendarEventId(req.params.eventId);
    const input = validateUpdateCalendarEventBody(req.body);

    const data = await CalendarEventsService.updateCalendarEvent(
      userId,
      eventId,
      input,
    );

    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
}

export async function deleteCalendarEvent(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Sesion no disponible",
      });
      return;
    }

    rejectQuery(req);
    rejectBody(req);

    const eventId = validateCalendarEventId(req.params.eventId);

    await CalendarEventsService.deleteCalendarEvent(userId, eventId);

    res.status(204).end();
  } catch (error) {
    sendError(res, error);
  }
}
