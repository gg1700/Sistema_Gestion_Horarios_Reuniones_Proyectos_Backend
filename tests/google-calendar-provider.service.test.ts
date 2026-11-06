import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGoogleCalendars } from "../src/services/google-calendar-provider.service";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Google Calendar provider", () => {
  it("maps owner and reader permissions correctly", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: "owner@group.calendar.google.com",
            summary: "Calendario editable",
            timeZone: "America/La_Paz",
            accessRole: "owner",
            primary: true
          },
          {
            id: "reader@group.calendar.google.com",
            summary: "Calendario compartido",
            timeZone: "UTC",
            accessRole: "reader"
          }
        ]
      })
    });

    const calendars = await fetchGoogleCalendars("access-token");

    expect(calendars).toHaveLength(2);
    expect(calendars[0].canWrite).toBe(true);
    expect(calendars[0].primary).toBe(true);
    expect(calendars[1].canWrite).toBe(false);
    expect(calendars[1].accessRole).toBe("reader");
  });

  it("handles multiple pages", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ id: "first", summary: "Primero", accessRole: "owner" }],
          nextPageToken: "next-page"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ id: "second", summary: "Segundo", accessRole: "writer" }]
        })
      });

    const calendars = await fetchGoogleCalendars("access-token");

    expect(calendars).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calendars[1].canWrite).toBe(true);
  });

  it("reports unauthorized Google requests", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401
    });

    await expect(
      fetchGoogleCalendars("expired-token")
    ).rejects.toMatchObject({
      code: "google_unauthorized"
    });
  });

  it("reports Google API failures", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503
    });

    await expect(
      fetchGoogleCalendars("access-token")
    ).rejects.toMatchObject({
      code: "google_calendar_unavailable"
    });
  });

  it("rejects invalid Google responses", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ invalid: true })
    });

    await expect(
      fetchGoogleCalendars("access-token")
    ).rejects.toMatchObject({
      code: "google_calendar_unavailable"
    });
  });

  it("rejects repeated pagination tokens", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [],
        nextPageToken: "repeated-token"
      })
    });

    await expect(
      fetchGoogleCalendars("access-token")
    ).rejects.toMatchObject({
      code: "google_calendar_unavailable"
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
