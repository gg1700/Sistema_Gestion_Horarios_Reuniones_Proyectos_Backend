import type { Request, Response } from "express";
import {
  listGoogleCalendars,
  selectGoogleCalendar,
  getGoogleCalendarStatus,
  unlinkGoogleCalendar,
  GoogleCalendarError
} from "../services/google-calendar.service";
function handleError(res: Response, error: unknown): void {
  if (error instanceof GoogleCalendarError) {
    const status: Record<GoogleCalendarError["code"], number> = {
      google_not_connected: 409,
      reconnection_required: 409,
      google_calendar_unavailable: 502,
      calendar_not_found: 404,
      calendar_read_only: 403,
      invalid_calendar_id: 400
    };

    res.status(status[error.code]).json({
      success: false,
      errorCode: error.code,
      message: error.message
    });
    return;
  }

  console.error("Google Calendar request failed");

  res.status(500).json({
    success: false,
    errorCode: "internal_error",
    message: "Error interno del servidor"
  });
}

export async function getCalendars(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const data = await listGoogleCalendars(userId);

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function selectCalendar(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const calendarId = req.body?.calendarId;

    const data = await selectGoogleCalendar(userId, calendarId);

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function getConnectionStatus(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const data = await getGoogleCalendarStatus(userId);

    res.status(200).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
}

export async function disconnectCalendar(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const data = await unlinkGoogleCalendar(userId);

    res.status(200).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
}
