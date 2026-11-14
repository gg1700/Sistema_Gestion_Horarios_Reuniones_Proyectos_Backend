import { describe, expect, it } from "vitest";
import {
  validateCancelBody,
  validateDecisionBody,
  validateProposalResponseBody,
  validateRescheduleBody,
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

describe("Validacion de reprogramacion", () => {
  const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(future.getTime() + 30 * 60 * 1000);

  it("acepta una propuesta de horario futura con mensaje opcional", () => {
    expect(validateRescheduleBody({ startsAt: future.toISOString(), endsAt: futureEnd.toISOString(), message: "  ¿Te sirve  el jueves? " }))
      .toMatchObject({ message: "¿Te sirve el jueves?" });
  });

  it("rechaza proponer un horario pasado", () => {
    expect(() => validateRescheduleBody({ startsAt: "2020-01-01T10:00:00Z", endsAt: "2020-01-01T11:00:00Z" }))
      .toThrow("La fecha de inicio debe ser futura");
  });

  it("al aceptar la propuesta no permite enviar otro horario", () => {
    expect(validateProposalResponseBody({ decision: "accepted" })).toEqual({ decision: "accepted" });
    expect(() => validateProposalResponseBody({ decision: "accepted", startsAt: future.toISOString() }))
      .toThrow("no se debe enviar otro horario");
  });

  it("la contrapropuesta exige el nuevo horario", () => {
    expect(() => validateProposalResponseBody({ decision: "counter" })).toThrow();
    expect(validateProposalResponseBody({
      decision: "counter", startsAt: future.toISOString(), endsAt: futureEnd.toISOString(), timeZone: "America/Lima",
    })).toMatchObject({ decision: "counter", timeZone: "America/Lima" });
  });
});
