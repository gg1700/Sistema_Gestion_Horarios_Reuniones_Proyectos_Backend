import { ValidationError } from "../helpers/errors.helper";

export function validatePublicCalendarLinkPatch(body: unknown): boolean {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const fields = Object.keys(body);
    if (fields.length === 1 && fields[0] === "active" &&
        "active" in body && typeof body.active === "boolean") {
      return body.active;
    }
  }

  throw new ValidationError("Envía únicamente el campo active como booleano");
}
