import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateAvailabilityRulesBody } from "../src/validators/availabilityRules.validator";

const mocks = vi.hoisted(() => ({
  findCalendarSettings: vi.fn(),
  findGoogleCalendarTimeZone: vi.fn(),
  findAvailabilityRules: vi.fn(),
  lockAvailabilityOwner: vi.fn(),
  upsertCalendarSettings: vi.fn(),
  replaceAvailabilityRules: vi.fn(),
  processTransaction: vi.fn(),
}));

vi.mock("../src/repositories/availabilityRules.repository", () => ({
  findCalendarSettings: mocks.findCalendarSettings,
  findGoogleCalendarTimeZone: mocks.findGoogleCalendarTimeZone,
  findAvailabilityRules: mocks.findAvailabilityRules,
  lockAvailabilityOwner: mocks.lockAvailabilityOwner,
  upsertCalendarSettings: mocks.upsertCalendarSettings,
  replaceAvailabilityRules: mocks.replaceAvailabilityRules,
}));

vi.mock("../src/utils/query", () => ({
  processTransaction: mocks.processTransaction,
}));

import * as service from "../src/services/availabilityRules.service";

const userId = "07a6ee45-42fd-4e8f-9176-230e43d89759";

const rule = {
  dayOfWeek: 1,
  startTime: "09:00",
  endTime: "12:00",
  active: true,
};

beforeEach(() => {
  vi.resetAllMocks();

  mocks.findCalendarSettings.mockResolvedValue(null);
  mocks.findGoogleCalendarTimeZone.mockResolvedValue(null);
  mocks.findAvailabilityRules.mockResolvedValue([]);
  mocks.lockAvailabilityOwner.mockResolvedValue(true);
  mocks.upsertCalendarSettings.mockResolvedValue(undefined);
  mocks.replaceAvailabilityRules.mockResolvedValue([]);

  mocks.processTransaction.mockImplementation(
    async (callback: (client: object) => Promise<unknown>) => callback({}),
  );
});

describe("Validación de disponibilidad semanal", () => {
  it("acepta una zona horaria válida y ninguna regla", () => {
    expect(
      validateAvailabilityRulesBody({
        timeZone: "America/La_Paz",
        rules: [],
      }),
    ).toEqual({
      timeZone: "America/La_Paz",
      rules: [],
    });
  });

  it.each([
    [{ timeZone: "Zona/Inexistente", rules: [] }, "zona horaria"],
    [{ timeZone: "UTC", rules: [{ ...rule, dayOfWeek: 7 }] }, "dia"],
    [{ timeZone: "UTC", rules: [{ ...rule, startTime: "12:00" }] }, "intervalo"],
    [{ timeZone: "UTC", rules: [{ ...rule, endTime: "24:00" }] }, "intervalo"],
    [{ timeZone: "UTC", rules: [{ ...rule, active: "true" }] }, "booleano"],
    [{ timeZone: "UTC", rules: [], userId }, "cuerpo"],
    [{ timeZone: "UTC", rules: [{ ...rule, userId }] }, "regla"],
  ])("rechaza datos inválidos: %j", (body, message) => {
    expect(() => validateAvailabilityRulesBody(body)).toThrow(message);
  });

  it("rechaza franjas solapadas y duplicadas del mismo día", () => {
    expect(() =>
      validateAvailabilityRulesBody({
        timeZone: "UTC",
        rules: [
          rule,
          { ...rule, startTime: "11:00", endTime: "13:00" },
        ],
      }),
    ).toThrow("solaparse");

    expect(() =>
      validateAvailabilityRulesBody({
        timeZone: "UTC",
        rules: [rule, rule],
      }),
    ).toThrow("solaparse");
  });

  it("permite franjas contiguas y franjas de días distintos", () => {
    expect(
      validateAvailabilityRulesBody({
        timeZone: "UTC",
        rules: [
          rule,
          { ...rule, startTime: "12:00", endTime: "14:00" },
          { ...rule, dayOfWeek: 2 },
        ],
      }).rules,
    ).toHaveLength(3);
  });
});

describe("Servicio de disponibilidad semanal", () => {
  it("devuelve UTC cuando no hay configuración ni calendario", async () => {
    await expect(service.getAvailabilityRules(userId)).resolves.toEqual({
      timeZone: "UTC",
      rules: [],
    });
  });

  it("prefiere la zona guardada frente a la del calendario", async () => {
    mocks.findCalendarSettings.mockResolvedValue("America/La_Paz");
    mocks.findAvailabilityRules.mockResolvedValue([
      { id: "rule-1", ...rule },
    ]);

    await expect(service.getAvailabilityRules(userId)).resolves.toEqual({
      timeZone: "America/La_Paz",
      rules: [{ id: "rule-1", ...rule }],
    });

    expect(mocks.findGoogleCalendarTimeZone).not.toHaveBeenCalled();
  });

  it("usa la zona del calendario si todavía no hay configuración", async () => {
    mocks.findGoogleCalendarTimeZone.mockResolvedValue("America/Lima");

    await expect(service.getAvailabilityRules(userId)).resolves.toEqual({
      timeZone: "America/Lima",
      rules: [],
    });
  });

  it("sin settings devuelve reglas vacías y no realiza escrituras", async () => {
    mocks.findCalendarSettings.mockResolvedValue(null);
    mocks.findGoogleCalendarTimeZone.mockResolvedValue("America/La_Paz");
    mocks.findAvailabilityRules.mockResolvedValue([
      { id: "rule-1", ...rule },
    ]);

    await expect(service.getAvailabilityRules(userId)).resolves.toEqual({
      timeZone: "America/La_Paz",
      rules: [],
    });

    expect(mocks.findAvailabilityRules).not.toHaveBeenCalled();
    expect(mocks.processTransaction).not.toHaveBeenCalled();
    expect(mocks.upsertCalendarSettings).not.toHaveBeenCalled();
    expect(mocks.replaceAvailabilityRules).not.toHaveBeenCalled();
  });

  it("reemplaza las reglas dentro de una transacción", async () => {
    const input = {
      timeZone: "America/La_Paz",
      rules: [rule],
    };

    const inserted = [{ id: "rule-1", ...rule }];
    mocks.replaceAvailabilityRules.mockResolvedValue(inserted);

    await expect(
      service.replaceAvailabilityRules(userId, input),
    ).resolves.toEqual({
      timeZone: input.timeZone,
      rules: inserted,
    });

    expect(mocks.processTransaction).toHaveBeenCalledOnce();

    expect(mocks.lockAvailabilityOwner).toHaveBeenCalledWith(
      {},
      userId,
    );

    expect(mocks.upsertCalendarSettings).toHaveBeenCalledWith(
      {},
      userId,
      input.timeZone,
    );

    expect(mocks.replaceAvailabilityRules).toHaveBeenCalledWith(
      {},
      userId,
      input.rules,
    );
  });

  it("no escribe si el usuario ya no está disponible", async () => {
    mocks.lockAvailabilityOwner.mockResolvedValue(false);

    await expect(
      service.replaceAvailabilityRules(userId, {
        timeZone: "UTC",
        rules: [],
      }),
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(mocks.upsertCalendarSettings).not.toHaveBeenCalled();
    expect(mocks.replaceAvailabilityRules).not.toHaveBeenCalled();
  });

  it("propaga un fallo de inserción para que la transacción revierta", async () => {
    mocks.replaceAvailabilityRules.mockRejectedValue(
      new Error("Fallo de base de datos"),
    );

    await expect(
      service.replaceAvailabilityRules(userId, {
        timeZone: "UTC",
        rules: [rule],
      }),
    ).rejects.toThrow("Fallo de base de datos");
  });
});