
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifySession: vi.fn(),
  findPublicCalendarLink: vi.fn(),
  findActiveUserHandle: vi.fn(),
  upsertPublicCalendarLink: vi.fn(),
  processTransaction: vi.fn(),
  env: {
    PUBLIC_CALENDAR_BASE_URL: "https://orbitia.example/calendar///",
  },
}));

vi.mock("../src/middlewares/session.middleware", () => ({
  verifySession: mocks.verifySession,
}));

vi.mock("../src/config/env.config", () => ({
  env: mocks.env,
}));

vi.mock("../src/repositories/publicCalendarLink.repository", () => ({
  findPublicCalendarLink: mocks.findPublicCalendarLink,
  findActiveUserHandle: mocks.findActiveUserHandle,
  upsertPublicCalendarLink: mocks.upsertPublicCalendarLink,
}));

vi.mock("../src/utils/query", () => ({
  processTransaction: mocks.processTransaction,
}));

import router from "../src/routes/publicCalendarLink.routes";

const path = "/api/v1/calendar/public-link";
const userId = "07a6ee45-42fd-4e8f-9176-230e43d89759";
const handleName = "el handle/real";

const app = express();
app.use(express.json());
app.use(path, router);

describe("Enlace público del calendario", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.verifySession.mockImplementation(
      (req: any, res: any, next: any) => {
        if (req.headers.authorization !== "Bearer valid-session") {
          res.status(401).json({
            success: false,
            message: "No autorizado",
          });
          return;
        }

        req.user = { userId };
        next();
      },
    );

    mocks.findPublicCalendarLink.mockResolvedValue({
      handleName,
      active: false,
    });

    mocks.findActiveUserHandle.mockResolvedValue(handleName);
    mocks.upsertPublicCalendarLink.mockResolvedValue(undefined);

    mocks.processTransaction.mockImplementation(
      async (callback: (client: unknown) => unknown) =>
        callback({}),
    );
  });

  it("devuelve el enlace público y codifica el handle", async () => {
    const response = await request(app)
      .get(path)
      .set("Authorization", "Bearer valid-session")
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        handleName,
        active: false,
        url: "https://orbitia.example/el%20handle%2Freal/disponibilidad",
        publicApiPath:
          "/api/v1/public/calendars/el%20handle%2Freal/availability",
      },
    });

    expect(mocks.findPublicCalendarLink).toHaveBeenCalledWith(userId);
  });

  it("devuelve el estado activo persistido", async () => {
    mocks.findPublicCalendarLink.mockResolvedValueOnce({
      handleName,
      active: true,
    });

    const response = await request(app)
      .get(path)
      .set("Authorization", "Bearer valid-session")
      .expect(200);

    expect(response.body.data.active).toBe(true);
  });

  it.each([true, false])(
    "actualiza el estado del enlace a %s",
    async (active) => {
      const response = await request(app)
        .patch(path)
        .set("Authorization", "Bearer valid-session")
        .send({ active })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          handleName,
          active,
          url: "https://orbitia.example/el%20handle%2Freal/disponibilidad",
          publicApiPath:
            "/api/v1/public/calendars/el%20handle%2Freal/availability",
        },
      });

      expect(mocks.findActiveUserHandle).toHaveBeenCalledWith(
        expect.anything(),
        userId,
      );

      expect(mocks.upsertPublicCalendarLink).toHaveBeenCalledWith(
        expect.anything(),
        userId,
        active,
      );

      expect(mocks.processTransaction).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    undefined,
    {},
    { active: "true" },
    { active: 1 },
    { active: null },
    { active: true, userId },
    [],
  ])("rechaza un cuerpo inválido: %j", async (body) => {
    await request(app)
      .patch(path)
      .set("Authorization", "Bearer valid-session")
      .send(body)
      .expect(400);

    expect(mocks.processTransaction).not.toHaveBeenCalled();
  });

  it("rechaza solicitudes sin sesión", async () => {
    await request(app).get(path).expect(401);

    await request(app)
      .patch(path)
      .set("Authorization", "Bearer invalid")
      .send({ active: true })
      .expect(401);

    expect(mocks.findPublicCalendarLink).not.toHaveBeenCalled();
    expect(mocks.processTransaction).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el usuario no está disponible", async () => {
    mocks.findPublicCalendarLink.mockResolvedValueOnce(null);

    await request(app)
      .get(path)
      .set("Authorization", "Bearer valid-session")
      .expect(404);
  });

  it("devuelve 404 si el usuario no está disponible al actualizar", async () => {
    mocks.findActiveUserHandle.mockResolvedValueOnce(null);

    await request(app)
      .patch(path)
      .set("Authorization", "Bearer valid-session")
      .send({ active: true })
      .expect(404);

    expect(mocks.upsertPublicCalendarLink).not.toHaveBeenCalled();
  });

  it("rechaza parámetros de consulta", async () => {
    await request(app)
      .get(`${path}?userId=${userId}`)
      .set("Authorization", "Bearer valid-session")
      .expect(400);

    await request(app)
      .patch(`${path}?userId=${userId}`)
      .set("Authorization", "Bearer valid-session")
      .send({ active: true })
      .expect(400);
  });

  it("rechaza un cuerpo en GET", async () => {
    await request(app)
      .get(path)
      .set("Authorization", "Bearer valid-session")
      .send({ active: true })
      .expect(400);
  });

  it("devuelve error 500 si falla la consulta", async () => {
    mocks.findPublicCalendarLink.mockRejectedValueOnce(
      new Error("Detalle SQL privado"),
    );

    const response = await request(app)
      .get(path)
      .set("Authorization", "Bearer valid-session")
      .expect(500);

    expect(response.body).toEqual({
      success: false,
      message: "No se pudo gestionar el enlace público del calendario",
    });
  });
});