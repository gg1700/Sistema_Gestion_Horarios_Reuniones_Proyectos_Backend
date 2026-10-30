import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findGoogleCalendarForUser: vi.fn(),
  getValidGoogleAccessToken: vi.fn(),
}));

vi.mock("../src/repositories/calendarEvents.repository", () => ({
  findGoogleCalendarForUser: mocks.findGoogleCalendarForUser,
}));

vi.mock("../src/services/google-token.service", () => {
  class GoogleTokenError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  }

  return {
    getValidGoogleAccessToken: mocks.getValidGoogleAccessToken,
    GoogleTokenError,
  };
});

import {
  getValidGoogleAccessToken,
  listGoogleEvents,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  GoogleCalendarClientError,
} from "../src/services/googleCalendarClient.service";

const userId = "07a6ee45-42fd-4e8f-9176-230e43d89759";
const from = "2026-11-01T00:00:00.000Z";
const to = "2026-11-30T23:59:59.000Z";

const connection = {
  connectionId: "b610ab20-12a0-4e19-a509-08d0c76cce1a",
  externalAccountId: "3fd0757a-878f-4bb1-b940-2798f897bd98",
  calendarId: "user@example.com",
  calendarName: "Personal",
  timeZone: "America/La_Paz",
  connectionStatus: "connected",
};

const googleEvent = {
  id: "event-123",
  summary: "Reunión de proyecto",
  description: "Sprint 2",
  start: {
    dateTime: "2026-11-02T09:00:00-04:00",
    timeZone: "America/La_Paz",
  },
  end: {
    dateTime: "2026-11-02T10:00:00-04:00",
    timeZone: "America/La_Paz",
  },
  status: "confirmed",
  updated: "2026-11-01T12:00:00Z",
};

const input = {
  title: "Reunión de proyecto",
  description: "Sprint 2",
  startsAt: "2026-11-02T13:00:00.000Z",
  endsAt: "2026-11-02T14:00:00.000Z",
  timeZone: "America/La_Paz",
  isPublic: false,
};

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function lastRequest(): { url: URL; options: RequestInit } {
  const call = fetchMock.mock.lastCall;

  if (!call) throw new Error("No se realizó una petición fetch");

  return {
    url: new URL(String(call[0])),
    options: call[1] as RequestInit,
  };
}

beforeEach(() => {
  vi.resetAllMocks();

  mocks.findGoogleCalendarForUser.mockResolvedValue(connection);
  mocks.getValidGoogleAccessToken.mockResolvedValue("access-token-test");

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Google Calendar client - tokens y conexión", () => {
  it("reutiliza el servicio existente de tokens", async () => {
    const token = await getValidGoogleAccessToken(userId);

    expect(token).toBe("access-token-test");
    expect(mocks.getValidGoogleAccessToken).toHaveBeenCalledWith(userId);
  });

  it("rechaza una conexión inexistente", async () => {
    mocks.findGoogleCalendarForUser.mockResolvedValue(null);

    await expect(
      listGoogleEvents(userId, from, to),
    ).rejects.toMatchObject({
      code: "google_not_connected",
      statusCode: 409,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rechaza una conexión que requiere reconexión", async () => {
    mocks.findGoogleCalendarForUser.mockResolvedValue({
      ...connection,
      connectionStatus: "reconnection_required",
    });

    await expect(
      listGoogleEvents(userId, from, to),
    ).rejects.toMatchObject({
      code: "reconnection_required",
      statusCode: 409,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Google Calendar client - GET", () => {
  it("devuelve una lista vacía", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));

    const events = await listGoogleEvents(userId, from, to, 50);

    expect(events).toEqual([]);

    const { url, options } = lastRequest();

    expect(url.hostname).toBe("www.googleapis.com");
    expect(url.pathname).toContain(
      encodeURIComponent(connection.calendarId),
    );
    expect(url.searchParams.get("timeMin")).toBe(from);
    expect(url.searchParams.get("timeMax")).toBe(to);
    expect(url.searchParams.get("maxResults")).toBe("50");

    expect(options.method).toBe("GET");
    expect(options.headers).toMatchObject({
      Authorization: "Bearer access-token-test",
    });
    expect(options.signal).toBeDefined();
  });

  it("normaliza fechas y datos del evento", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ items: [googleEvent] }),
    );

    const events = await listGoogleEvents(userId, from, to);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "event-123",
      title: "Reunión de proyecto",
      startsAt: "2026-11-02T13:00:00.000Z",
      endsAt: "2026-11-02T14:00:00.000Z",
      timeZone: "America/La_Paz",
      eventStatus: "confirmed",
    });
  });

  it("consulta las páginas siguientes", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        items: [googleEvent],
        nextPageToken: "pagina-2",
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [{
          ...googleEvent,
          id: "event-456",
        }],
      }));

    const events = await listGoogleEvents(userId, from, to, 10);

    expect(events).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const { url } = lastRequest();
    expect(url.searchParams.get("pageToken")).toBe("pagina-2");
  });

  it("rechaza respuestas malformadas del proveedor", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ unexpected: true }),
    );

    await expect(
      listGoogleEvents(userId, from, to),
    ).rejects.toMatchObject({
      code: "google_invalid_response",
      statusCode: 502,
    });
  });
});

describe("Google Calendar client - escritura", () => {
  it("crea un evento usando POST", async () => {
    fetchMock.mockResolvedValue(jsonResponse(googleEvent, 201));

    const result = await createGoogleEvent(userId, input);

    const { url, options } = lastRequest();
    const body = JSON.parse(String(options.body));

    expect(options.method).toBe("POST");
    expect(url.pathname).toContain("/events");
    expect(body.summary).toBe(input.title);
    expect(body.start.dateTime).toBe(input.startsAt);
    expect(body.end.dateTime).toBe(input.endsAt);
    expect(result.id).toBe("event-123");
  });

  it("actualiza un evento con PATCH", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ...googleEvent,
        summary: "Título actualizado",
      }),
    );

    const result = await updateGoogleEvent(
      userId,
      "event-123",
      { title: "Título actualizado" },
    );

    const { url, options } = lastRequest();
    const body = JSON.parse(String(options.body));

    expect(options.method).toBe("PATCH");
    expect(url.pathname).toContain("/events/event-123");
    expect(body.summary).toBe("Título actualizado");
    expect(result.title).toBe("Título actualizado");
  });

  it("elimina un evento con DELETE", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      deleteGoogleEvent(userId, "event-123"),
    ).resolves.toBeUndefined();

    const { url, options } = lastRequest();

    expect(options.method).toBe("DELETE");
    expect(url.pathname).toContain("/events/event-123");
  });
});

describe("Google Calendar client - errores", () => {
  it("traduce 401 a reconexión requerida", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "Unauthorized" }, 401),
    );

    await expect(
      listGoogleEvents(userId, from, to),
    ).rejects.toMatchObject({
      code: "reconnection_required",
      statusCode: 409,
    });
  });

  it("traduce 429 a límite de peticiones", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "Rate limit" }, 429),
    );

    await expect(
      listGoogleEvents(userId, from, to),
    ).rejects.toMatchObject({
      code: "google_rate_limited",
      statusCode: 429,
    });
  });

  it("traduce 503 a proveedor no disponible", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "Unavailable" }, 503),
    );

    await expect(
      listGoogleEvents(userId, from, to),
    ).rejects.toMatchObject({
      code: "google_calendar_unavailable",
      statusCode: 503,
    });
  });

  it("maneja fallos de red sin revelar credenciales", async () => {
    fetchMock.mockRejectedValue(new Error("Network failure"));

    await expect(
      listGoogleEvents(userId, from, to),
    ).rejects.toBeInstanceOf(GoogleCalendarClientError);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

    it("incluye eventos de día completo", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
        items: [{
        id: "all-day-event",
        summary: "Día ocupado",
        start: { date: "2026-11-02" },
        end: { date: "2026-11-03" },
        status: "confirmed",
        }],
    }));

    const events = await listGoogleEvents(userId, from, to);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
        id: "all-day-event",
        title: "Día ocupado",
        startsAt: "2026-11-02T04:00:00.000Z",
        endsAt: "2026-11-03T04:00:00.000Z",
        timeZone: "America/La_Paz",
    });
    });

    it("traduce cuota excedida a 429", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
        error: {
        errors: [{ reason: "rateLimitExceeded" }],
        },
    }, 403));

    await expect(
        listGoogleEvents(userId, from, to),
    ).rejects.toMatchObject({
        code: "google_rate_limited",
        statusCode: 429,
    });
    });

    it("traduce permisos insuficientes a reconexión", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
        error: {
        errors: [{ reason: "insufficientPermissions" }],
        },
    }, 403));

    await expect(
        listGoogleEvents(userId, from, to),
    ).rejects.toMatchObject({
        code: "reconnection_required",
        statusCode: 409,
    });
    });

    it("actualiza las fechas y la zona horaria juntas", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
        ...googleEvent,
        start: {
        dateTime: "2026-11-02T09:00:00-05:00",
        timeZone: "America/Bogota",
        },
        end: {
        dateTime: "2026-11-02T10:00:00-05:00",
        timeZone: "America/Bogota",
        },
    }));

    await updateGoogleEvent(userId, "event-123", {
        startsAt: "2026-11-02T14:00:00.000Z",
        endsAt: "2026-11-02T15:00:00.000Z",
        timeZone: "America/Bogota",
    });

    const { options } = lastRequest();
    const body = JSON.parse(String(options.body));

    expect(body.start.timeZone).toBe("America/Bogota");
    expect(body.end.timeZone).toBe("America/Bogota");
    });

});