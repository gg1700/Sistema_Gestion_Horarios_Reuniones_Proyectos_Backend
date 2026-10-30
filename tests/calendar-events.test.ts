import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServerError } from "../src/helpers/errors.helper";

const mocks = vi.hoisted(() => ({
  verifySession: vi.fn(),
  isActiveProfileUser: vi.fn(),
  findGoogleCalendarForUser: vi.fn(),
  findOwnedCalendarEvent: vi.fn(),
  upsertCalendarEventMirror: vi.fn(),
  deleteCalendarEventMirror: vi.fn(),
  listGoogleEvents: vi.fn(),
  createGoogleEvent: vi.fn(),
  updateGoogleEvent: vi.fn(),
  deleteGoogleEvent: vi.fn(),
}));

vi.mock("../src/services/session.service", () => ({
  verifySession: mocks.verifySession,
}));

vi.mock("../src/repositories/profile-read.repository", () => ({
  isActiveProfileUser: mocks.isActiveProfileUser,
}));

vi.mock("../src/repositories/calendarEvents.repository", () => ({
  findGoogleCalendarForUser: mocks.findGoogleCalendarForUser,
  findOwnedCalendarEvent: mocks.findOwnedCalendarEvent,
  upsertCalendarEventMirror: mocks.upsertCalendarEventMirror,
  deleteCalendarEventMirror: mocks.deleteCalendarEventMirror,
}));

vi.mock("../src/services/googleCalendarClient.service", () => ({
  listGoogleEvents: mocks.listGoogleEvents,
  createGoogleEvent: mocks.createGoogleEvent,
  updateGoogleEvent: mocks.updateGoogleEvent,
  deleteGoogleEvent: mocks.deleteGoogleEvent,
}));

vi.mock("../src/config/env.config", () => ({
  env: { NODE_ENV: "test" },
}));

import router from "../src/routes/calendarEvents.routes";

const path = "/api/v1/calendar/events";
const userId = "07a6ee45-42fd-4e8f-9176-230e43d89759";
const eventId = "bb214b33-0a13-49a3-9f64-9ab2c651c932";
const connectionId = "b610ab20-12a0-4e19-a509-08d0c76cce1a";
const authorization = "Bearer valid-session";

const calendar = {
  connectionId,
  externalAccountId: "3fd0757a-878f-4bb1-b940-2798f897bd98",
  calendarId: "primary",
  calendarName: "Personal",
  timeZone: "America/La_Paz",
  connectionStatus: "connected",
};

const googleEvent = {
  id: "google-event-123",
  title: "Reunión de proyecto",
  description: "Revisión del Sprint 2",
  location: null,
  startsAt: "2026-11-02T13:00:00.000Z",
  endsAt: "2026-11-02T14:00:00.000Z",
  timeZone: "America/La_Paz",
  eventStatus: "confirmed",
  providerUpdatedAt: null,
};

const mirror = {
  id: eventId,
  userId,
  calendarConnectionId: connectionId,
  googleEventId: googleEvent.id,
  title: googleEvent.title,
  description: googleEvent.description,
  location: googleEvent.location,
  startsAt: googleEvent.startsAt,
  endsAt: googleEvent.endsAt,
  timeZone: googleEvent.timeZone,
  isPublic: false,
  eventStatus: "confirmed",
  syncStatus: "synced",
  providerUpdatedAt: null,
  syncedAt: "2026-11-01T12:00:00.000Z",
};

const input = {
  title: "Reunión de proyecto",
  startsAt: "2026-11-02T09:00:00-04:00",
  endsAt: "2026-11-02T10:00:00-04:00",
  timeZone: "America/La_Paz",
  description: "Revisión del Sprint 2",
};

const app = express();
app.use(express.json());
app.use(path, router);

beforeEach(() => {
  vi.resetAllMocks();

  mocks.verifySession.mockImplementation((token: string) => {
    if (token !== "valid-session") {
      throw new Error("Token inválido");
    }
    return { userId, handlename: "usuario-prueba" };
  });

  mocks.isActiveProfileUser.mockResolvedValue(true);
  mocks.findGoogleCalendarForUser.mockResolvedValue(calendar);
  mocks.findOwnedCalendarEvent.mockResolvedValue(mirror);
  mocks.upsertCalendarEventMirror.mockResolvedValue(mirror);
  mocks.deleteCalendarEventMirror.mockResolvedValue(true);

  mocks.listGoogleEvents.mockResolvedValue([googleEvent]);
  mocks.createGoogleEvent.mockResolvedValue(googleEvent);
  mocks.updateGoogleEvent.mockResolvedValue(googleEvent);
  mocks.deleteGoogleEvent.mockResolvedValue(undefined);
});

describe("Calendar events - autenticación", () => {
  it.each(["get", "post", "patch", "delete"] as const)(
    "%s requiere sesión",
    async method => {
      const url = method === "patch" || method === "delete"
        ? `${path}/${eventId}`
        : path;

      await request(app)[method](url).expect(401);
    },
  );

  it("rechaza un token inválido", async () => {
    await request(app)
      .get(path)
      .set("Authorization", "Bearer invalid-session")
      .expect(401);
  });

  it("rechaza un usuario inactivo", async () => {
    mocks.isActiveProfileUser.mockResolvedValue(false);

    await request(app)
      .get(path)
      .set("Authorization", authorization)
      .expect(401);

    expect(mocks.listGoogleEvents).not.toHaveBeenCalled();
  });

  it("obtiene el propietario desde la sesión", async () => {
    await request(app)
      .get(path)
      .set("Authorization", authorization)
      .expect(200);

    expect(mocks.findGoogleCalendarForUser).toHaveBeenCalledWith(userId);
    expect(mocks.listGoogleEvents).toHaveBeenCalledWith(
      userId,
      expect.any(String),
      expect.any(String),
      50,
    );
  });
});

describe("Calendar events - GET", () => {
  it("devuelve un arreglo vacío", async () => {
    mocks.listGoogleEvents.mockResolvedValue([]);

    const response = await request(app)
      .get(path)
      .set("Authorization", authorization)
      .expect(200);

    expect(response.body).toEqual({ success: true, data: [] });
    expect(mocks.upsertCalendarEventMirror).not.toHaveBeenCalled();
  });

  it("sincroniza eventos y no expone datos internos", async () => {
    const response = await request(app)
      .get(path)
      .set("Authorization", authorization)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data[0]).toMatchObject({
      id: eventId,
      title: googleEvent.title,
      isPublic: false,
      syncStatus: "synced",
    });

    expect(response.body.data[0]).not.toHaveProperty("userId");
    expect(response.body.data[0]).not.toHaveProperty("googleEventId");
    expect(response.body.data[0]).not.toHaveProperty("calendarConnectionId");
    expect(mocks.upsertCalendarEventMirror).toHaveBeenCalledTimes(1);
  });

  it("valida el rango y el límite", async () => {
    await request(app)
      .get(`${path}?limit=101`)
      .set("Authorization", authorization)
      .expect(400);

    await request(app)
      .get(`${path}?from=2026-11-02T10:00:00Z&to=2026-11-01T10:00:00Z`)
      .set("Authorization", authorization)
      .expect(400);

    await request(app)
      .get(`${path}?from=2026-11-01T00:00:00Z&to=2027-03-01T00:00:00Z`)
      .set("Authorization", authorization)
      .expect(400);

    expect(mocks.listGoogleEvents).not.toHaveBeenCalled();
  });

  it("rechaza parámetros desconocidos", async () => {
    await request(app)
      .get(`${path}?userId=${userId}`)
      .set("Authorization", authorization)
      .expect(400);
  });
});

describe("Calendar events - POST", () => {
  it("crea primero en Google y después en PostgreSQL", async () => {
    const order: string[] = [];

    mocks.createGoogleEvent.mockImplementation(async () => {
      order.push("google");
      return googleEvent;
    });

    mocks.upsertCalendarEventMirror.mockImplementation(async () => {
      order.push("postgres");
      return mirror;
    });

    const response = await request(app)
      .post(path)
      .set("Authorization", authorization)
      .send(input)
      .expect(201);

    expect(order).toEqual(["google", "postgres"]);
    expect(response.body.data.id).toBe(eventId);

    expect(mocks.createGoogleEvent).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        title: input.title,
        isPublic: false,
      }),
    );
  });

  it("rechaza fechas inválidas", async () => {
    await request(app)
      .post(path)
      .set("Authorization", authorization)
      .send({
        ...input,
        endsAt: "2026-11-02T08:00:00-04:00",
      })
      .expect(400);

    expect(mocks.createGoogleEvent).not.toHaveBeenCalled();
  });

  it("rechaza campos desconocidos y propietarios enviados por el cliente", async () => {
    await request(app)
      .post(path)
      .set("Authorization", authorization)
      .send({ ...input, userId })
      .expect(400);

    expect(mocks.createGoogleEvent).not.toHaveBeenCalled();
  });

  it("intenta compensar si falla el guardado local", async () => {
    mocks.upsertCalendarEventMirror.mockRejectedValue(
      new Error("Fallo de persistencia local"),
    );

    const response = await request(app)
      .post(path)
      .set("Authorization", authorization)
      .send(input)
      .expect(500);

    expect(mocks.createGoogleEvent).toHaveBeenCalledOnce();
    expect(mocks.deleteGoogleEvent).toHaveBeenCalledWith(
      userId,
      googleEvent.id,
    );
    expect(response.body.message).not.toContain("persistencia local");
  });
});

describe("Calendar events - PATCH", () => {
  it("envía las fechas existentes cuando cambia solo la zona horaria", async () => {
    mocks.updateGoogleEvent.mockResolvedValue({
      ...googleEvent,
      timeZone: "America/Bogota",
    });

    await request(app)
      .patch(`${path}/${eventId}`)
      .set("Authorization", authorization)
      .send({ timeZone: "America/Bogota" })
      .expect(200);

    expect(mocks.updateGoogleEvent).toHaveBeenCalledWith(
      userId,
      googleEvent.id,
      expect.objectContaining({
        startsAt: mirror.startsAt,
        endsAt: mirror.endsAt,
        timeZone: "America/Bogota",
      }),
    );
  });

  it("reintenta el guardado local sin repetir el PATCH de Google", async () => {
    mocks.upsertCalendarEventMirror
      .mockRejectedValueOnce(new Error("Fallo temporal de PostgreSQL"))
      .mockResolvedValueOnce(mirror);

    await request(app)
      .patch(`${path}/${eventId}`)
      .set("Authorization", authorization)
      .send({ title: "Evento actualizado" })
      .expect(200);

    expect(mocks.updateGoogleEvent).toHaveBeenCalledTimes(1);
    expect(mocks.upsertCalendarEventMirror).toHaveBeenCalledTimes(2);
  });

  it("actualiza Google y el espejo local", async () => {
    const response = await request(app)
      .patch(`${path}/${eventId}`)
      .set("Authorization", authorization)
      .send({ title: "Reunión actualizada" })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(mocks.findOwnedCalendarEvent).toHaveBeenCalledWith(userId, eventId);
    expect(mocks.updateGoogleEvent).toHaveBeenCalledWith(
      userId,
      googleEvent.id,
      expect.objectContaining({ title: "Reunión actualizada" }),
    );
    expect(mocks.upsertCalendarEventMirror).toHaveBeenCalledOnce();
  });

  it("cambia solo la visibilidad sin llamar a Google", async () => {
    await request(app)
      .patch(`${path}/${eventId}`)
      .set("Authorization", authorization)
      .send({ isPublic: true })
      .expect(200);

    expect(mocks.updateGoogleEvent).not.toHaveBeenCalled();
    expect(mocks.upsertCalendarEventMirror).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: true }),
    );
  });

  it("rechaza un evento ajeno", async () => {
    mocks.findOwnedCalendarEvent.mockResolvedValue(null);

    await request(app)
      .patch(`${path}/${eventId}`)
      .set("Authorization", authorization)
      .send({ title: "No autorizado" })
      .expect(404);

    expect(mocks.updateGoogleEvent).not.toHaveBeenCalled();
  });

  it("rechaza UUID inválido y body vacío", async () => {
    await request(app)
      .patch(`${path}/invalid-uuid`)
      .set("Authorization", authorization)
      .send({ title: "Evento" })
      .expect(400);

    await request(app)
      .patch(`${path}/${eventId}`)
      .set("Authorization", authorization)
      .send({})
      .expect(400);
  });
});

describe("Calendar events - DELETE", () => {
  it("reintenta eliminar el espejo sin repetir el DELETE de Google", async () => {
    mocks.deleteCalendarEventMirror
      .mockRejectedValueOnce(new Error("Fallo temporal de PostgreSQL"))
      .mockResolvedValueOnce(true);

    await request(app)
      .delete(`${path}/${eventId}`)
      .set("Authorization", authorization)
      .expect(204);

    expect(mocks.deleteGoogleEvent).toHaveBeenCalledTimes(1);
    expect(mocks.deleteCalendarEventMirror).toHaveBeenCalledTimes(2);
  });

  it("no confirma el DELETE si PostgreSQL falla permanentemente", async () => {
    mocks.deleteCalendarEventMirror.mockRejectedValue(
      new Error("PostgreSQL no disponible"),
    );

    await request(app)
      .delete(`${path}/${eventId}`)
      .set("Authorization", authorization)
      .expect(500);

    expect(mocks.deleteGoogleEvent).toHaveBeenCalledTimes(1);
    expect(mocks.deleteCalendarEventMirror).toHaveBeenCalledTimes(2);
  });

  it("elimina primero en Google y luego en PostgreSQL", async () => {
    const order: string[] = [];

    mocks.deleteGoogleEvent.mockImplementation(async () => {
      order.push("google");
    });

    mocks.deleteCalendarEventMirror.mockImplementation(async () => {
      order.push("postgres");
      return true;
    });

    const response = await request(app)
      .delete(`${path}/${eventId}`)
      .set("Authorization", authorization)
      .expect(204);

    expect(response.text).toBe("");
    expect(order).toEqual(["google", "postgres"]);
  });

  it("no elimina el espejo cuando falla Google", async () => {
    mocks.deleteGoogleEvent.mockRejectedValue(
      new ServerError("Proveedor no disponible", 503),
    );

    await request(app)
      .delete(`${path}/${eventId}`)
      .set("Authorization", authorization)
      .expect(503);

    expect(mocks.deleteCalendarEventMirror).not.toHaveBeenCalled();
  });

  it("no permite eliminar eventos ajenos", async () => {
    mocks.findOwnedCalendarEvent.mockResolvedValue(null);

    await request(app)
      .delete(`${path}/${eventId}`)
      .set("Authorization", authorization)
      .expect(404);

    expect(mocks.deleteGoogleEvent).not.toHaveBeenCalled();
  });

  it("rechaza un body en DELETE", async () => {
    await request(app)
      .delete(`${path}/${eventId}`)
      .set("Authorization", authorization)
      .send({ version: 2 })
      .expect(400);

    expect(mocks.deleteGoogleEvent).not.toHaveBeenCalled();
  });
});

describe("Calendar events - conexión y errores", () => {
  it("devuelve 409 cuando Google Calendar no está conectado", async () => {
    mocks.findGoogleCalendarForUser.mockResolvedValue(null);

    await request(app)
      .get(path)
      .set("Authorization", authorization)
      .expect(409);

    expect(mocks.listGoogleEvents).not.toHaveBeenCalled();
  });

  it("devuelve 409 cuando se necesita reconexión", async () => {
    mocks.findGoogleCalendarForUser.mockResolvedValue({
      ...calendar,
      connectionStatus: "reconnection_required",
    });

    await request(app)
      .get(path)
      .set("Authorization", authorization)
      .expect(409);
  });

  it.each([429, 502, 503])(
    "propaga el estado %i del proveedor sin exponer secretos",
    async status => {
      mocks.listGoogleEvents.mockRejectedValue(
        new ServerError("Error del proveedor", status),
      );

      const response = await request(app)
        .get(path)
        .set("Authorization", authorization)
        .expect(status);

      expect(response.body.success).toBe(false);
      expect(JSON.stringify(response.body)).not.toContain("access_token");
    },
  );

  it("no expone errores SQL internos", async () => {
    mocks.findGoogleCalendarForUser.mockRejectedValue(
      new Error("SELECT access_token FROM external_account"),
    );

    const response = await request(app)
      .get(path)
      .set("Authorization", authorization)
      .expect(500);

    expect(JSON.stringify(response.body)).not.toContain("access_token");
  });
});
