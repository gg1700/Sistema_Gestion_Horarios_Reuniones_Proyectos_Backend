import type { Request, Response } from "express";
import {
  ServerError,
  ValidationError,
} from "../helpers/errors.helper";
import * as service from "../services/publicCalendarAvailability.service";

function validateDateQuery(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`El parámetro ${field} debe tener formato YYYY-MM-DD`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new ValidationError(`La fecha del parámetro ${field} no es válida`);
  }

  return value;
}

export async function getPublicCalendarAvailability(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (
      Object.keys(req.query).some(
        (key) => key !== "from" && key !== "to",
      )
    ) {
      throw new ValidationError("Parámetros de consulta no permitidos");
    }

    const from = validateDateQuery(req.query.from, "from");
    const to = validateDateQuery(req.query.to, "to");

    const fromTimestamp = Date.parse(`${from}T00:00:00.000Z`);
    const toTimestamp = Date.parse(`${to}T00:00:00.000Z`);

    const days = (toTimestamp - fromTimestamp) / (24 * 60 * 60 * 1000);

    if (!Number.isInteger(days) || days < 1 || days > 62) {
      throw new ValidationError(
        "El intervalo debe ser de entre 1 y 62 días",
      );
    }

    const handle = (req.params.handle as string).trim().toLowerCase();

    if (!/^[a-z0-9-]{3,50}$/.test(handle)) {
      throw new ValidationError("Nombre de usuario inválido");
    }

    const data = await service.getPublicCalendarAvailability(
      handle,
      from,
      to,
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    const statusCode =
      error instanceof ServerError ? error.statusCode : 500;

    res.status(statusCode).json({
      success: false,
      message:
        error instanceof Error && statusCode !== 500
          ? error.message
          : "No se pudo consultar la disponibilidad pública",
    });
  }
}