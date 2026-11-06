import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActivePublicCalendarByHandle: vi.fn(),
  refreshEventMirrors: vi.fn(),
  findPublicEventsInRange: vi.fn(),
  findAllBusyEventsInRange: vi.fn(),
  findAvailabilityRules: vi.fn(),
  findGoogleCalendarForUser: vi.fn(),
  getValidGoogleAccessToken: vi.fn(),
  processTransaction: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("../src/repositories/publicCalendar.repository", () => ({
  findActivePublicCalendarByHandle: mocks.findActivePublicCalendarByHandle,
  refreshEventMirrors: mocks.refreshEventMirrors,
  findPublicEventsInRange: mocks.findPublicEventsInRange,
  findAllBusyEventsInRange: mocks.findAllBusyEventsInRange,
  findAvailabilityRules: mocks.findAvailabilityRules,
}));
vi.mock("../src/repositories/calendarEvents.repository", () => ({
  findGoogleCalendarForUser: mocks.findGoogleCalendarForUser,
}));
vi.mock("../src/services/google-token.service", () => ({
  getValidGoogleAccessToken: mocks.getValidGoogleAccessToken,
}));
vi.mock("../src/utils/query", () => ({ processTransaction: mocks.processTransaction }));

import router from "../src/routes/publicCalendar.routes";
import { subtractBusySlots } from "../src/services/publicCalendar.service";
import { validatePublicCalendarRangeQuery } from "../src/validators/publicCalendar.validator";

const app = express();
app.set("trust proxy", "loopback");
app.use("/api/v1/public/calendars", router);

const path = "/api/v1/public/calendars/ana";
const day = "2026-11-09";
const iso = (hour: string) => `${day}T${hour}:00.000Z`;
const interval = (start: string, end: string) => ({ startsAt: iso(start), endsAt: iso(end) });
const range = { from: iso("12:00"), to: iso("18:00") };
const owner = {
  userId: "b5cc1841-2fd7-43a4-a48e-07bec9c563a9",
  connectionId: "616234af-4896-4cff-af10-c3828effa31d",
  googleCalendarId: "google-calendar-id",
  handleName: "ana",
  timeZone: "America/La_Paz",
};
const client = {};

function remoteEvent(id: string, start: string, end: string) {
  return {
    id,
    summary: `Evento ${id}`,
    status: "confirmed",
    start: { dateTime: iso(start) },
    end: { dateTime: iso(end) },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockImplementation(async () => Response.json({ items: [] }));
  mocks.findActivePublicCalendarByHandle.mockResolvedValue(owner);
  mocks.findGoogleCalendarForUser.mockResolvedValue({
    calendarId: owner.googleCalendarId,
    connectionStatus: "connected",
    timeZone: owner.timeZone,
  });
  mocks.getValidGoogleAccessToken.mockResolvedValue("token-privado");
  mocks.processTransaction.mockImplementation(async callback => callback(client));
  mocks.findPublicEventsInRange.mockResolvedValue([]);
  mocks.findAllBusyEventsInRange.mockResolvedValue([]);
  mocks.findAvailabilityRules.mockResolvedValue([]);
});

afterEach(() => vi.unstubAllGlobals());

describe("GET calendario público", () => {
  it("pagina Google y devuelve solo los campos públicos y las franjas libres", async () => {
    const publicEvent = {
      title: "Taller",
      description: "Taller abierto",
      ...interval("13:00", "14:00"),
      timeZone: owner.timeZone,
    };
    mocks.fetch
      .mockResolvedValueOnce(Response.json({
        items: [remoteEvent("publico", "13:00", "14:00")],
        nextPageToken: "segunda-pagina",
      }))
      .mockResolvedValueOnce(Response.json({ items: [
        remoteEvent("privado", "14:00", "15:00"),
        { id: "cancelado", status: "cancelled" },
      ] }));
    mocks.findPublicEventsInRange.mockResolvedValue([publicEvent]);
    mocks.findAllBusyEventsInRange.mockResolvedValue([interval("13:00", "14:00"), interval("14:00", "15:00")]);
    mocks.findAvailabilityRules.mockResolvedValue([interval("12:00", "17:00")]);

    const response = await request(app).get(path).query(range).expect(200).expect("Cache-Control", "no-store");

    expect(response.body).toEqual({ success: true, data: {
      ...range,
      handleName: owner.handleName,
      timeZone: owner.timeZone,
      events: [publicEvent],
      busySlots: [interval("13:00", "14:00"), interval("14:00", "15:00")],
      availableWindows: [interval("12:00", "13:00"), interval("15:00", "17:00")],
    } });
    expect(mocks.fetch.mock.calls[1][0].searchParams.get("pageToken")).toBe("segunda-pagina");
    expect(mocks.fetch.mock.calls[1][0].searchParams.get("singleEvents")).toBe("true");
    expect(mocks.refreshEventMirrors).toHaveBeenCalledWith(
      client, owner.userId, owner.connectionId, owner.googleCalendarId,
      [expect.objectContaining({ id: "publico" }), expect.objectContaining({ id: "privado" })],
    );
  });

  it("devuelve 404 y evita consultar Google cuando el calendario no está publicado", async () => {
    mocks.findActivePublicCalendarByHandle.mockResolvedValue(null);
    const response = await request(app).get(path).query(range).expect(404);
    expect(response.body).toEqual({ success: false, message: "Calendario no disponible" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("verifica el enlace otra vez antes de publicar una sincronización", async () => {
    mocks.findActivePublicCalendarByHandle.mockResolvedValueOnce(owner).mockResolvedValueOnce(null);
    await request(app).get(path).query(range).expect(404);
    expect(mocks.refreshEventMirrors).not.toHaveBeenCalled();
  });

  it("conserva los eventos visibles si el dueño no configuró disponibilidad", async () => {
    const event = { title: "Taller", ...interval("13:00", "14:00"), timeZone: owner.timeZone };
    mocks.findPublicEventsInRange.mockResolvedValue([event]);

    const response = await request(app).get(path).query(range).expect(200);
    expect(response.body.data).toMatchObject({ events: [event], availableWindows: [] });
  });

  it.each([
    { from: "2026-02-30T12:00:00Z" },
    { from: "2026-11-09T12:00:00" },
    { from: range.to, to: range.from },
    { from: range.from, to: "2027-03-01T00:00:00Z" },
    { from: [range.from, range.from] },
    { ...range, limit: "50" },
  ])("rechaza parámetros inválidos %j", async query => {
    await request(app).get(path).query(query).expect(400);
    expect(mocks.findActivePublicCalendarByHandle).not.toHaveBeenCalled();
  });

  it("rechaza un handle fuera del formato público", async () => {
    await request(app).get("/api/v1/public/calendars/A_na").query(range).expect(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("redondea hacia afuera la consulta a Google y conserva el rango exacto de la API", async () => {
    const query = { from: `${day}T12:00:00.200Z`, to: `${day}T18:00:00.200Z` };
    const response = await request(app).get(path).query(query).expect(200);
    const googleQuery = mocks.fetch.mock.calls[0][0].searchParams;

    expect(googleQuery.get("timeMin")).toBe(range.from);
    expect(googleQuery.get("timeMax")).toBe(`${day}T18:00:01.000Z`);
    expect(response.body.data).toMatchObject(query);
  });

  it.each([429, 503])("traduce un error de Google %s a un 503 genérico", async status => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ error: "token-privado" }, { status }));
    const response = await request(app).get(path).query(range).expect(503);
    expect(response.text).not.toContain("token-privado");
    expect(mocks.refreshEventMirrors).not.toHaveBeenCalled();
  });

  it("rechaza un rango con un evento remoto que no se puede interpretar", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ items: [
      remoteEvent("valido", "13:00", "14:00"),
      { id: "incompleto", status: "confirmed" },
    ] }));
    await request(app).get(path).query(range).expect(503);
    expect(mocks.refreshEventMirrors).not.toHaveBeenCalled();
  });

  it("rechaza horas remotas que se interpretarían en la zona del servidor", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ items: [{
      ...remoteEvent("hora-ambigua", "13:00", "14:00"),
      start: { dateTime: `${day}T13:00:00` },
    }] }));
    await request(app).get(path).query(range).expect(503);
    expect(mocks.refreshEventMirrors).not.toHaveBeenCalled();
  });

  it("rechaza un rango que excede el máximo de eventos verificables", async () => {
    const items = Array.from({ length: 250 }, (_, index) => remoteEvent(`evento-${index}`, "13:00", "14:00"));
    for (let page = 1; page <= 4; page++) {
      mocks.fetch.mockResolvedValueOnce(Response.json({ items, nextPageToken: `pagina-${page}` }));
    }
    mocks.fetch.mockResolvedValueOnce(Response.json({ items: [remoteEvent("extra", "13:00", "14:00")] }));

    await request(app).get(path).query(range).expect(503);
    expect(mocks.refreshEventMirrors).not.toHaveBeenCalled();
  });

  it("devuelve 500 sin exponer errores internos", async () => {
    mocks.findActivePublicCalendarByHandle.mockRejectedValue(new Error("SELECT información interna"));
    const response = await request(app).get(path).query(range).expect(500);
    expect(response.text).not.toContain("SELECT");
  });

  it("limita a 30 peticiones por IP en un minuto", async () => {
    mocks.findActivePublicCalendarByHandle.mockResolvedValue(null);
    for (let attempt = 0; attempt < 30; attempt++) {
      await request(app).get(path).query(range).set("X-Forwarded-For", "192.0.2.41").expect(404);
    }
    await request(app).get(path).query(range).set("X-Forwarded-For", "192.0.2.41").expect(429);
    expect(mocks.findActivePublicCalendarByHandle).toHaveBeenCalledTimes(30);
  });
});

describe("Ventanas de disponibilidad", () => {
  it("une reglas solapadas y resta ocupaciones contiguas y exteriores", () => {
    expect(subtractBusySlots(
      [interval("09:00", "11:00"), interval("10:00", "14:00"), interval("16:00", "17:00")],
      [interval("16:00", "18:00"), interval("10:00", "11:00"), interval("11:00", "12:00"), interval("07:00", "09:00")],
    )).toEqual([interval("09:00", "10:00"), interval("12:00", "14:00")]);
  });

  it("usa 30 días por defecto desde el instante actual", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(range.from));
      expect(validatePublicCalendarRangeQuery({})).toEqual({ from: range.from, to: "2026-12-09T12:00:00.000Z" });
    } finally {
      vi.useRealTimers();
    }
  });
});
