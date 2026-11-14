import { describe, expect, it } from "vitest";
import {
  validateCancelBody,
  validateDecisionBody,
} from "../src/validators/meeting-requests.validator";

describe("Validacion de decisiones sobre solicitudes de reunion", () => {
  it("exige un motivo al rechazar", () => {
    expect(() => validateDecisionBody({ decision: "rejected" }))
      .toThrow("El motivo del rechazo es obligatorio");
  });

  it("rechaza motivos demasiado cortos", () => {
    expect(() => validateDecisionBody({ decision: "rejected", responseMessage: "no" }))
      .toThrow("El motivo del rechazo debe tener entre 5 y 2000 caracteres");
  });

  it("normaliza el motivo del rechazo", () => {
    expect(validateDecisionBody({ decision: "rejected", responseMessage: "  Tengo   otra reunion  " }))
      .toEqual({ decision: "rejected", responseMessage: "Tengo otra reunion" });
  });

  it("permite aceptar sin mensaje", () => {
    expect(validateDecisionBody({ decision: "accepted" })).toEqual({ decision: "accepted" });
  });
});

describe("Validacion de cancelaciones", () => {
  it("exige un motivo al cancelar", () => {
    expect(() => validateCancelBody({})).toThrow("El motivo de la cancelacion es obligatorio");
  });

  it("no admite otros campos", () => {
    expect(() => validateCancelBody({ reason: "Ya no puedo asistir", status: "cancelled" }))
      .toThrow("Campo no permitido: status");
  });

  it("devuelve el motivo normalizado", () => {
    expect(validateCancelBody({ reason: " Ya   no puedo asistir " })).toEqual({ reason: "Ya no puedo asistir" });
  });
});
