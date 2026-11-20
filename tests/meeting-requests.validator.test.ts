import { describe, expect, it } from "vitest";
import {
  validateMeetingReqInfo,
  validateUpdateMeetingRequest,
} from "../src/validators/meeting-requests.validator";
import { ValidationError } from "../src/helpers/errors.helper";

const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const endsAt = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();

const validRequest = {
  recipientHandle: "usuario-prueba",
  title: "Sprint 3: revision de API v2.1 (QA)",
  startsAt,
  endsAt,
  timeZone: "America/La_Paz",
};

describe("Validación de títulos de solicitudes", () => {
  it("conserva números, siglas y puntuación al crear", () => {
    const result = validateMeetingReqInfo(validRequest);

    expect(result.title).toBe("Sprint 3: revision de API v2.1 (QA)");
  });

  it("conserva números, siglas y puntuación al editar", () => {
    const result = validateUpdateMeetingRequest({
      title: "API REST v2: OAuth 2.0 + Google Meet",
    });

    expect(result.title).toBe("API REST v2: OAuth 2.0 + Google Meet");
  });

  it("normaliza espacios repetidos", () => {
    const result = validateUpdateMeetingRequest({
      title: "  Sprint   3:    revision   de API  ",
    });

    expect(result.title).toBe("Sprint 3: revision de API");
  });

  it("elimina caracteres de control y los signos angulares", () => {
    const result = validateUpdateMeetingRequest({
      title: "<Sprint 3>\n revision de API",
    });

    expect(result.title).toBe("Sprint 3 revision de API");
  });

  it("rechaza títulos vacíos", () => {
    expect(() =>
      validateUpdateMeetingRequest({ title: "   " }),
    ).toThrow(ValidationError);
  });

  it("rechaza títulos que superan los 150 caracteres", () => {
    expect(() =>
      validateUpdateMeetingRequest({ title: "A".repeat(151) }),
    ).toThrow(ValidationError);
  });
});