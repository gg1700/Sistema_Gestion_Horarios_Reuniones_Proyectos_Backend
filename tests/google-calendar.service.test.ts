import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleCalendar } from "../src/types/google-calendar.types";

const mocks = vi.hoisted(() => ({
  getValidGoogleAccessToken: vi.fn(),
  fetchGoogleCalendars: vi.fn(),
  findSelectedCalendar: vi.fn(),
  saveSelectedCalendar: vi.fn()
}));

vi.mock("../src/services/google-token.service", () => ({
  getValidGoogleAccessToken: mocks.getValidGoogleAccessToken
}));

vi.mock("../src/services/google-calendar-provider.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/services/google-calendar-provider.service")>()),
  fetchGoogleCalendars: mocks.fetchGoogleCalendars
}));

vi.mock("../src/repositories/google-calendar.repository", () => ({
  findSelectedCalendar: mocks.findSelectedCalendar,
  saveSelectedCalendar: mocks.saveSelectedCalendar
}));

import {
  listGoogleCalendars,
  selectGoogleCalendar
} from "../src/services/google-calendar.service";

const userId = "test-user-id";

const writableCalendar: GoogleCalendar = {
  id: "writable@group.calendar.google.com",
  name: "Calendario de prueba",
  description: "",
  timezone: "America/La_Paz",
  primary: false,
  canWrite: true,
  accessRole: "owner",
  color: "#039BE5"
};

const readonlyCalendar: GoogleCalendar = {
  id: "readonly@group.calendar.google.com",
  name: "Calendario de lectura",
  description: "",
  timezone: "UTC",
  primary: false,
  canWrite: false,
  accessRole: "reader",
  color: null
};

beforeEach(() => {
  vi.resetAllMocks();

  mocks.getValidGoogleAccessToken.mockResolvedValue("valid-access-token");
  mocks.fetchGoogleCalendars.mockResolvedValue([
    writableCalendar,
    readonlyCalendar
  ]);
  mocks.findSelectedCalendar.mockResolvedValue(null);
  mocks.saveSelectedCalendar.mockImplementation(
    async (_userId, calendar) => calendar
  );
});

describe("Google Calendar service", () => {
  it("lists accessible Google calendars", async () => {
    const result = await listGoogleCalendars(userId);

    expect(result.calendars).toHaveLength(2);
    expect(result.selectedCalendarId).toBeNull();
    expect(result.connectionStatus).toBeNull();

    expect(mocks.getValidGoogleAccessToken).toHaveBeenCalledWith(userId);
    expect(mocks.fetchGoogleCalendars).toHaveBeenCalledWith("valid-access-token");
    expect(mocks.findSelectedCalendar).toHaveBeenCalledWith(userId);
  });

  it("returns the previously selected calendar", async () => {
    mocks.findSelectedCalendar.mockResolvedValue({
      google_calendar_id: writableCalendar.id,
      name: writableCalendar.name,
      timezone: writableCalendar.timezone,
      status: "connected"
    });

    const result = await listGoogleCalendars(userId);

    expect(result.selectedCalendarId).toBe(writableCalendar.id);
    expect(result.connectionStatus).toBe("connected");
  });

  it("selects a writable calendar", async () => {
    const result = await selectGoogleCalendar(userId, writableCalendar.id);

    expect(result).toEqual({
      calendarId: writableCalendar.id,
      calendarName: writableCalendar.name,
      timezone: writableCalendar.timezone,
      status: "connected"
    });

    expect(mocks.saveSelectedCalendar).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        calendarId: writableCalendar.id,
        status: "connected"
      })
    );
  });

  it("rejects a read-only calendar", async () => {
    await expect(
      selectGoogleCalendar(userId, readonlyCalendar.id)
    ).rejects.toMatchObject({
      code: "calendar_read_only"
    });

    expect(mocks.saveSelectedCalendar).not.toHaveBeenCalled();
  });

  it("rejects a calendar not accessible by the user", async () => {
    await expect(
      selectGoogleCalendar(userId, "unknown@group.calendar.google.com")
    ).rejects.toMatchObject({
      code: "calendar_not_found"
    });

    expect(mocks.saveSelectedCalendar).not.toHaveBeenCalled();
  });

  it("rejects an empty calendar ID", async () => {
    await expect(
      selectGoogleCalendar(userId, "")
    ).rejects.toMatchObject({
      code: "invalid_calendar_id"
    });

    expect(mocks.fetchGoogleCalendars).not.toHaveBeenCalled();
    expect(mocks.saveSelectedCalendar).not.toHaveBeenCalled();
  });

  it("rejects a missing calendar ID", async () => {
    await expect(
      selectGoogleCalendar(userId, undefined as unknown as string)
    ).rejects.toMatchObject({
      code: "invalid_calendar_id"
    });

    expect(mocks.saveSelectedCalendar).not.toHaveBeenCalled();
  });

  it("requires reconnection when the Google authorization was revoked", async () => {
    mocks.getValidGoogleAccessToken.mockRejectedValue(
      Object.assign(new Error("reconnection_required"), {
        code: "reconnection_required"
      })
    );

    await expect(
      listGoogleCalendars(userId)
    ).rejects.toMatchObject({
      code: "reconnection_required"
    });

    expect(mocks.fetchGoogleCalendars).not.toHaveBeenCalled();
    expect(mocks.saveSelectedCalendar).not.toHaveBeenCalled();
  });

  it("rejects an account without a Google connection", async () => {
    mocks.getValidGoogleAccessToken.mockRejectedValue(
      Object.assign(new Error("google_not_connected"), {
        code: "google_not_connected"
      })
    );

    await expect(
      listGoogleCalendars(userId)
    ).rejects.toMatchObject({
      code: "google_not_connected"
    });
  });
});
