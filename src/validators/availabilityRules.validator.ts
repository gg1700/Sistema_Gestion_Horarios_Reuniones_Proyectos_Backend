import { ValidationError } from "../helpers/errors.helper";
import type {
  AvailabilityRuleInput,
  ReplaceAvailabilityRulesInput,
} from "../types/availabilityRules.types";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

export function validateTimeZone(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError("La zona horaria es obligatoria");
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    throw new ValidationError("La zona horaria no es valida");
  }

  return value;
}

function validateRule(value: unknown): AvailabilityRuleInput {
  if (
    !isObject(value) ||
    !hasOnlyKeys(value, ["dayOfWeek", "startTime", "endTime", "active"])
  ) {
    throw new ValidationError("La regla de disponibilidad es invalida");
  }

  const { dayOfWeek, startTime, endTime, active } = value;

  if (!Number.isInteger(dayOfWeek) || Number(dayOfWeek) < 0 || Number(dayOfWeek) > 6) {
    throw new ValidationError("El dia de la semana debe estar entre 0 y 6");
  }

  if (
    typeof startTime !== "string" ||
    typeof endTime !== "string" ||
    !timePattern.test(startTime) ||
    !timePattern.test(endTime) ||
    startTime >= endTime
  ) {
    throw new ValidationError("El intervalo horario es invalido");
  }

  if (typeof active !== "boolean") {
    throw new ValidationError("El estado de la regla debe ser booleano");
  }

  return { dayOfWeek: Number(dayOfWeek), startTime, endTime, active };
}

export function validateAvailabilityRulesBody(
  body: unknown,
): ReplaceAvailabilityRulesInput {
  if (
    !isObject(body) ||
    !hasOnlyKeys(body, ["timeZone", "rules"]) ||
    !Array.isArray(body.rules)
  ) {
    throw new ValidationError("El cuerpo de la solicitud es invalido");
  }

  const timeZone = validateTimeZone(body.timeZone);
  const rules = body.rules.map(validateRule);

  const ordered = [...rules].sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek ||
      a.startTime.localeCompare(b.startTime),
  );

  for (let index = 1; index < ordered.length; index++) {
    const previous = ordered[index - 1];
    const current = ordered[index];

    if (
      previous.dayOfWeek === current.dayOfWeek &&
      current.startTime < previous.endTime
    ) {
      throw new ValidationError(
        "Las franjas del mismo dia no pueden solaparse",
      );
    }
  }

  return { timeZone, rules };
}