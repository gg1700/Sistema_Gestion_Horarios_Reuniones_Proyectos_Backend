import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifySession: vi.fn(),
  isActiveProfileUser: vi.fn(),
  getAvailabilityRules: vi.fn(),
  replaceAvailabilityRules: vi.fn(),
}));

vi.mock("../src/services/session.service", () => ({
  verifySession: mocks.verifySession,
}));

vi.mock("../src/repositories/profile-read.repository", () => ({
  isActiveProfileUser: mocks.isActiveProfileUser,
}));

vi.mock("../src/services/availabilityRules.service", () => ({
  getAvailabilityRules: mocks.getAvailabilityRules,
  replaceAvailabilityRules: mocks.replaceAvailabilityRules,
}));

vi.mock("../src/config/env.config", () => ({
  env: { NODE_ENV: "test" },
}));

import router from "../src/routes/availabilityRules.routes";

const path = "/api/v1/calendar/availability-rules";
const userId = "07a6ee45-42fd-4e8f-9176-230e43d89759";
const authorization = "Bearer valid-session";

const app = express();
app.use(express.json());
app.use(path, router);

beforeEach(() => {
  vi.resetAllMocks();

  mocks.verifySession.mockImplementation((token: string) => {
    if (token !== "valid-session") {
      throw new Error("Token invalido");
    }

    return {
      userId,
      handlename: "usuario-prueba",
    };
  });

  mocks.isActiveProfileUser.mockResolvedValue(true);

  mocks.getAvailabilityRules.mockResolvedValue({
    timeZone: "UTC",
    rules: [],
  });

  mocks.replaceAvailabilityRules.mockResolvedValue({
    timeZone: "America/La_Paz",
    rules: [],
  });
});

describe("HTTP de disponibilidad semanal", () => {
  it("GET y PUT requieren sesión", async () => {
    await request(app).get(path).expect(401);

    await request(app)
      .put(path)
      .send({ timeZone: "UTC", rules: [] })
      .expect(401);

    expect(mocks.getAvailabilityRules).not.toHaveBeenCalled();
    expect(mocks.replaceAvailabilityRules).not.toHaveBeenCalled();
  });

  it("rechaza un token inválido", async () => {
    await request(app)
      .get(path)
      .set("Authorization", "Bearer invalid-session")
      .expect(401);
  });

  it("rechaza un usuario que ya no está disponible", async () => {
    mocks.isActiveProfileUser.mockResolvedValue(false);

    await request(app)
      .get(path)
      .set("Authorization", authorization)
      .expect(401);

    expect(mocks.getAvailabilityRules).not.toHaveBeenCalled();
  });

  it("GET consulta únicamente al usuario de la sesión", async () => {
    const response = await request(app)
      .get(path)
      .set("Authorization", authorization)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        timeZone: "UTC",
        rules: [],
      },
    });

    expect(mocks.getAvailabilityRules).toHaveBeenCalledWith(userId);
  });

  it("GET rechaza parámetros no admitidos", async () => {
    await request(app)
      .get(`${path}?userId=otro-usuario`)
      .set("Authorization", authorization)
      .expect(400);

    expect(mocks.getAvailabilityRules).not.toHaveBeenCalled();
  });

  it.each([{}, "texto"])("GET rechaza un cuerpo: %j", async (body) => {
    await request(app)
      .get(path)
      .set("Authorization", authorization)
      .send(body)
      .expect(400);

    expect(mocks.getAvailabilityRules).not.toHaveBeenCalled();
  });

  it("PUT permite vaciar las reglas del usuario autenticado", async () => {
    const input = {
      timeZone: "America/La_Paz",
      rules: [],
    };

    const response = await request(app)
      .put(path)
      .set("Authorization", authorization)
      .send(input)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: input,
    });

    expect(mocks.replaceAvailabilityRules).toHaveBeenCalledWith(
      userId,
      input,
    );
  });

  it("PUT no permite elegir otro propietario desde el body", async () => {
    await request(app)
      .put(path)
      .set("Authorization", authorization)
      .send({
        userId: "otro-usuario",
        timeZone: "UTC",
        rules: [],
      })
      .expect(400);

    expect(mocks.replaceAvailabilityRules).not.toHaveBeenCalled();
  });

  it("PUT rechaza franjas solapadas antes de guardar", async () => {
    await request(app)
      .put(path)
      .set("Authorization", authorization)
      .send({
        timeZone: "UTC",
        rules: [
          {
            dayOfWeek: 1,
            startTime: "09:00",
            endTime: "12:00",
            active: true,
          },
          {
            dayOfWeek: 1,
            startTime: "11:00",
            endTime: "13:00",
            active: true,
          },
        ],
      })
      .expect(400);

    expect(mocks.replaceAvailabilityRules).not.toHaveBeenCalled();
  });

  it("oculta el detalle de un error interno", async () => {
    mocks.getAvailabilityRules.mockRejectedValue(
      new Error("Detalle SQL que no debe publicarse"),
    );

    const response = await request(app)
      .get(path)
      .set("Authorization", authorization)
      .expect(500);

    expect(response.body).toEqual({
      success: false,
      message: "No se pudo gestionar la disponibilidad",
    });
  });
});