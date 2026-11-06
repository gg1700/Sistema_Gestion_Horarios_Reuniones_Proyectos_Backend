import type { Request, Response } from "express";
import { NotFoundError, ValidationError } from "../helpers/errors.helper";
import * as service from "../services/publicCalendar.service";
import {
  validatePublicCalendarHandle,
  validatePublicCalendarRangeQuery,
} from "../validators/publicCalendar.validator";

export async function getPublicCalendar(req: Request, res: Response): Promise<void> {
  res.set("Cache-Control", "no-store");

  try {
    const handle = validatePublicCalendarHandle(req.params.handle);
    const { from, to } = validatePublicCalendarRangeQuery(req.query);
    const data = await service.getPublicCalendar(handle, from, to);
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof NotFoundError ||
      error instanceof service.PublicCalendarUnavailableError
    ) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    res.status(500).json({ success: false, message: "No se pudo consultar el calendario" });
  }
}
