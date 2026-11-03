import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServerError } from "../src/helpers/errors.helper";

const mocks = vi.hoisted(() => ({
  verifySession: vi.fn(),
  isActiveProfileUser: vi.fn(),
  query: vi.fn(),
}));

vi.mock("../src/services/session.service", () => ({ verifySession: mocks.verifySession }));
vi.mock("../src/repositories/profile-read.repository", () => ({
  isActiveProfileUser: mocks.isActiveProfileUser,
}));
vi.mock("../src/utils/query", () => ({ processReturnQuery: mocks.query }));

import router from "../src/routes/notifications.routes";

const path = "/api/v1/notifications";
const userId = "07a6ee45-42fd-4e8f-9176-230e43d89759";
const otherUserId = "e834486c-6782-474d-8a34-eac1f4bb3ce1";
const notificationId = "031aed25-a003-4e09-9b0a-e83fa7ff7c4b";
const auth = "Bearer valid-session";
const readAt = "2026-10-29T18:00:00.000Z";

const app = express();
app.use(express.json());
app.use(path, router);

function queryMock(sql: string, params: unknown[]) {
  if (sql.includes("SET read_at")) {
    return Promise.resolve([{ id: notificationId, read_at: readAt }]);
  }
  if (sql.includes("COUNT(*)") && sql.includes("read_at IS NULL") && params.length === 1) {
    return Promise.resolve([{ total: 1 }]);
  }
  if (sql.includes("COUNT(*)")) {
    return Promise.resolve([{ total: 2 }]);
  }
  return Promise.resolve([]);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.verifySession.mockImplementation((token: string) => {
    if (token !== "valid-session") throw new Error("Sesion invalida");
    return { userId };
  });
  mocks.isActiveProfileUser.mockResolvedValue(true);
  mocks.query.mockImplementation(queryMock);
});

describe("T-44 - Notificaciones del usuario", () => {
  it("rechaza consultas y marcado sin sesion", async () => {
    await request(app).get(path).expect(401);
    await request(app).patch(`${path}/${notificationId}/read`).expect(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("devuelve una lista vacia con conteos", async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([{ total: 0 }]);
    const response = await request(app).get(path).set("Authorization", auth).expect(200);
    expect(response.body).toEqual({
      success: true,
      data: { items: [], page: 1, limit: 20, total: 0, unreadCount: 0 },
    });
  });

  it("valida paginacion y aplica usuario, orden y offset en SQL", async () => {
    await request(app).get(`${path}?page=2&limit=5`).set("Authorization", auth).expect(200);
    const [listSql, values] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(listSql).toContain("WHERE user_id = $1");
    expect(listSql).toContain("ORDER BY created_at DESC, id DESC");
    expect(values).toEqual([userId, false, 5, 5]);
    expect(mocks.query.mock.calls.every(([, params]) => (params as unknown[])[0] === userId)).toBe(true);
  });

  it("unreadOnly=true filtra sin leidas y mantiene conteos propios", async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce([{ total: 1 }]);
    const response = await request(app).get(`${path}?unreadOnly=true&page=1&limit=50`)
      .set("Authorization", auth).expect(200);
    expect(response.body.data).toMatchObject({ total: 1, unreadCount: 1, page: 1, limit: 50 });
    expect(mocks.query.mock.calls[0][1]).toEqual([userId, true, 50, 0]);
  });

  it.each([
    "unreadOnly=1", "unreadOnly=TRUE", "unreadOnly=", "unreadOnly=true&unreadOnly=false",
    "page=0", "page=-1", "page=1.5", "page=abc", "limit=0", "limit=51", "limit=2.5", "userId=otro",
  ])("rechaza query invalida: %s", async (query) => {
    await request(app).get(`${path}?${query}`).set("Authorization", auth).expect(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("transforma filas sin exponer actor_user_id ni secretos del payload", async () => {
    mocks.query.mockResolvedValueOnce([{
      id: notificationId,
      notification_type: "meeting_request_created",
      title: "Nueva solicitud",
      message: "Tienes una solicitud",
      actor_user_id: otherUserId,
      payload: { meetingRequestId: "req-123", access_token: "privado", details: { password: "no" } },
      created_at: "2026-10-29T16:00:00.000Z",
      read_at: null,
    }]);
    const response = await request(app).get(path).set("Authorization", auth).expect(200);
    expect(response.body.data.items[0]).toEqual({
      id: notificationId,
      type: "meeting_request_created",
      title: "Nueva solicitud",
      message: "Tienes una solicitud",
      payload: { meetingRequestId: "req-123" },
      createdAt: "2026-10-29T16:00:00.000Z",
      readAt: null,
    });
    expect(JSON.stringify(response.body)).not.toContain("privado");
    expect(JSON.stringify(response.body)).not.toContain(otherUserId);
  });

  it("rechaza UUID invalido antes de acceder a la base", async () => {
    await request(app).patch(`${path}/no-es-uuid/read`).set("Authorization", auth).expect(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rechaza cuerpo y query en PATCH", async () => {
    await request(app).patch(`${path}/${notificationId}/read?userId=otro`)
      .set("Authorization", auth).expect(400);
    await request(app).patch(`${path}/${notificationId}/read`)
      .set("Authorization", auth).send({ userId: otherUserId }).expect(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("devuelve 404 para notificacion inexistente o ajena", async () => {
    mocks.query.mockResolvedValueOnce([]);
    await request(app).patch(`${path}/${notificationId}/read`).set("Authorization", auth).expect(404);
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("WHERE id = $1 AND user_id = $2");
    expect(params).toEqual([notificationId, userId]);
  });

  it("marca como leida y repite con el mismo timestamp", async () => {
    const first = await request(app).patch(`${path}/${notificationId}/read`)
      .set("Authorization", auth).expect(200);
    const second = await request(app).patch(`${path}/${notificationId}/read`)
      .set("Authorization", auth).expect(200);
    expect(first.body.data).toEqual({ id: notificationId, readAt });
    expect(second.body.data).toEqual(first.body.data);
    const [sql] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("COALESCE(read_at, NOW())");
  });

  it("oculta errores internos", async () => {
    mocks.query.mockRejectedValue(new Error("SQL secreto"));
    const response = await request(app).get(path).set("Authorization", auth).expect(500);
    expect(JSON.stringify(response.body)).not.toContain("SQL secreto");
  });

  it("oculta mensajes internos de errores tipados", async () => {
    mocks.query.mockRejectedValue(
      new ServerError("Error SQL interno privado", 500)
    );

    const response = await request(app)
      .get(path)
      .set("Authorization", auth)
      .expect(500);

    expect(response.body).toEqual({
      success: false,
      message: "Error interno del servidor"
    });
  });
});
