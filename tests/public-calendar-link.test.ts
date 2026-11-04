import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifySession: vi.fn(),
  processReturnQuery: vi.fn(),
  processTransaction: vi.fn(),
  query: vi.fn(),
  env: { PUBLIC_CALENDAR_BASE_URL: "https://orbitia.example/calendar///" },
}));

vi.mock("../src/services/session.service", () => ({ verifySession: mocks.verifySession }));
vi.mock("../src/config/env.config", () => ({ env: mocks.env }));
vi.mock("../src/utils/query", () => ({
  processReturnQuery: mocks.processReturnQuery,
  processTransaction: mocks.processTransaction,
}));

import router from "../src/routes/publicCalendarLink.routes";

const path = "/api/v1/calendar/public-link";
const userId = "07a6ee45-42fd-4e8f-9176-230e43d89759";
const handleName = "el handle/real";
const authorization = "Bearer valid-session";

const app = express();
app.use(express.json());
app.use(path, router);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.PUBLIC_CALENDAR_BASE_URL = "https://orbitia.example/calendar///";
  mocks.verifySession.mockImplementation((token: string) => {
    if (token !== "valid-session") throw new Error("Token inválido");
    return { userId, handlename: "handle-desactualizado" };
  });
  mocks.processTransaction.mockImplementation(async (callback) =>
    callback({ query: mocks.query }),
  );
  mocks.query.mockResolvedValueOnce({ rows: [{ handle_name: handleName }] });
});

describe("Enlace público del calendario", () => {
  it("devuelve false sin crear una fila y codifica el handle de la base", async () => {
    mocks.processReturnQuery.mockResolvedValueOnce([{ handle_name: handleName, active: false }]);

    const response = await request(app).get(path).set("Authorization", authorization).expect(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        handleName,
        active: false,
        url: "https://orbitia.example/calendar/el%20handle%2Freal",
        publicApiPath: "/api/v1/public/calendars/el%20handle%2Freal",
      },
    });
    expect(mocks.processReturnQuery).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/COALESCE\(link\.active, FALSE\)[\s\S]+LEFT JOIN public\.public_calendar_link/),
      [userId],
    );
    expect(mocks.processTransaction).not.toHaveBeenCalled();
  });

  it("devuelve el estado persistido", async () => {
    mocks.processReturnQuery.mockResolvedValueOnce([{ handle_name: handleName, active: true }]);
    const response = await request(app).get(path).set("Authorization", authorization).expect(200);
    expect(response.body.data.active).toBe(true);
  });

  it.each([true, false])("guarda active=%s únicamente para el dueño activo", async (active) => {
    const response = await request(app)
      .patch(path)
      .set("Authorization", authorization)
      .send({ active })
      .expect(200);

    expect(response.body.data).toMatchObject({ handleName, active });
    expect(mocks.processTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenNthCalledWith(1, expect.stringContaining("FOR UPDATE"), [userId]);
    expect(mocks.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/ON CONFLICT \(user_id\)[\s\S]+updated_at = NOW\(\)/),
      [userId, active],
    );
  });

  it.each([{}, { active: "true" }, { active: true, userId }, { active: false, handleName }, []])(
    "rechaza PATCH con body inválido %j",
    async (body) => {
      await request(app).patch(path).set("Authorization", authorization).send(body).expect(400);
      expect(mocks.processTransaction).not.toHaveBeenCalled();
    },
  );

  it("rechaza query en ambos métodos y cuerpo en GET", async () => {
    await request(app).get(`${path}?handle=otro`).set("Authorization", authorization).expect(400);
    await request(app).get(path).set("Authorization", authorization).send({}).expect(400);
    await request(app)
      .patch(`${path}?userId=otro`)
      .set("Authorization", authorization)
      .send({ active: true })
      .expect(400);
    expect(mocks.processReturnQuery).not.toHaveBeenCalled();
    expect(mocks.processTransaction).not.toHaveBeenCalled();
  });

  it("requiere una sesión válida", async () => {
    await request(app).get(path).expect(401);
    await request(app).patch(path).set("Authorization", "Bearer inválido").send({ active: true }).expect(401);
    expect(mocks.processReturnQuery).not.toHaveBeenCalled();
    expect(mocks.processTransaction).not.toHaveBeenCalled();
  });

  it("responde 404 para un usuario no disponible y evita guardar", async () => {
    mocks.processReturnQuery.mockResolvedValueOnce([]);
    mocks.query.mockReset().mockResolvedValueOnce({ rows: [] });

    await request(app).get(path).set("Authorization", authorization).expect(404);
    await request(app).patch(path).set("Authorization", authorization).send({ active: true }).expect(404);

    expect(mocks.processReturnQuery).toHaveBeenCalledWith(expect.stringContaining("deleted_at IS NULL"), [userId]);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("devuelve un error genérico ante un fallo de SQL", async () => {
    mocks.processReturnQuery.mockRejectedValueOnce(new Error("Detalle SQL privado"));
    const response = await request(app).get(path).set("Authorization", authorization).expect(500);
    expect(response.body).toEqual({
      success: false,
      message: "No se pudo gestionar el enlace público del calendario",
    });
  });
});
