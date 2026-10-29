import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleCalendarConnectionRow } from "../src/repositories/google-calendar.repository";

const mocks = vi.hoisted(() => ({
  getValidGoogleAccessToken: vi.fn(),
  fetchGoogleCalendars: vi.fn(),
  revokeGoogleToken: vi.fn(),
  findSelectedCalendar: vi.fn(),
  saveSelectedCalendar: vi.fn(),
  findGoogleCalendarConnection: vi.fn(),
  disconnectGoogleCalendar: vi.fn()
}));

vi.mock("../src/services/google-token.service", () => ({
  getValidGoogleAccessToken: mocks.getValidGoogleAccessToken
}));

vi.mock("../src/services/google-calendar-provider.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/services/google-calendar-provider.service")>()),
  fetchGoogleCalendars: mocks.fetchGoogleCalendars,
  revokeGoogleToken: mocks.revokeGoogleToken
}));

vi.mock("../src/repositories/google-calendar.repository", () => ({
  findSelectedCalendar: mocks.findSelectedCalendar,
  saveSelectedCalendar: mocks.saveSelectedCalendar,
  findGoogleCalendarConnection: mocks.findGoogleCalendarConnection,
  disconnectGoogleCalendar: mocks.disconnectGoogleCalendar
}));

import {
  getGoogleCalendarStatus,
  unlinkGoogleCalendar
} from "../src/services/google-calendar.service";

import { GoogleCalendarRevocationError } from "../src/services/google-calendar-provider.service";

const userId = "test-user-id";
const calendarId = "test@group.calendar.google.com";
const calendarName = "Calendario de prueba";

const calendarScopes = [
  "openid",
  "profile",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events"
].join(" ");

const connectedAccount: GoogleCalendarConnectionRow = {
  state: "active",
  scopes: calendarScopes,
  has_refresh_token: true,
  google_calendar_id: calendarId,
  calendar_name: calendarName,
  calendar_status: "connected"
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findGoogleCalendarConnection.mockResolvedValue(null);
  mocks.disconnectGoogleCalendar.mockResolvedValue(undefined);
  mocks.revokeGoogleToken.mockResolvedValue(undefined);
});

describe("T-37: Google Calendar connection status", () => {
  it("returns connected for an active connection", async () => {
    mocks.findGoogleCalendarConnection.mockResolvedValue(connectedAccount);

    expect(await getGoogleCalendarStatus(userId)).toEqual({
      status: "connected",
      calendarId,
      calendarName,
      reconnectRequired: false
    });
  });

  it("returns disconnected without a Google account", async () => {
    expect(await getGoogleCalendarStatus(userId)).toEqual({
      status: "disconnected",
      calendarId: null,
      calendarName: null,
      reconnectRequired: false
    });
  });

  it("returns disconnected without Calendar scopes", async () => {
    mocks.findGoogleCalendarConnection.mockResolvedValue({
      ...connectedAccount,
      scopes: "openid profile email",
      google_calendar_id: null,
      calendar_name: null,
      calendar_status: null
    });

    expect(await getGoogleCalendarStatus(userId)).toEqual({
      status: "disconnected",
      calendarId: null,
      calendarName: null,
      reconnectRequired: false
    });
  });

  it("returns disconnected after voluntary unlinking", async () => {
    mocks.findGoogleCalendarConnection.mockResolvedValue({
      ...connectedAccount,
      state: "revoked",
      scopes: null,
      has_refresh_token: false,
      google_calendar_id: null,
      calendar_name: null,
      calendar_status: null
    });

    expect(await getGoogleCalendarStatus(userId)).toEqual({
      status: "disconnected",
      calendarId: null,
      calendarName: null,
      reconnectRequired: false
    });
  });

  it("returns expired when reconnection is required", async () => {
    mocks.findGoogleCalendarConnection.mockResolvedValue({
      ...connectedAccount,
      state: "revoked",
      calendar_status: "reconnection_required"
    });

    expect(await getGoogleCalendarStatus(userId)).toEqual({
      status: "expired",
      calendarId,
      calendarName,
      reconnectRequired: true
    });
  });

  it("returns expired when the refresh token is missing", async () => {
    mocks.findGoogleCalendarConnection.mockResolvedValue({
      ...connectedAccount,
      has_refresh_token: false
    });

    const result = await getGoogleCalendarStatus(userId);

    expect(result.status).toBe("expired");
    expect(result.reconnectRequired).toBe(true);
  });

  it("returns expired for revoked credentials", async () => {
    mocks.findGoogleCalendarConnection.mockResolvedValue({
      ...connectedAccount,
      state: "revoked"
    });

    const result = await getGoogleCalendarStatus(userId);

    expect(result.status).toBe("expired");
    expect(result.reconnectRequired).toBe(true);
  });

  it("returns disconnected for an inactive authorization", async () => {
    mocks.findGoogleCalendarConnection.mockResolvedValue({
      ...connectedAccount,
      state: "inactive"
    });

    const result = await getGoogleCalendarStatus(userId);

    expect(result.status).toBe("disconnected");
    expect(result.reconnectRequired).toBe(false);
  });

  it("does not contact Google when checking the stored status", async () => {
    mocks.findGoogleCalendarConnection.mockResolvedValue(connectedAccount);

    await getGoogleCalendarStatus(userId);

    expect(mocks.getValidGoogleAccessToken).not.toHaveBeenCalled();
    expect(mocks.fetchGoogleCalendars).not.toHaveBeenCalled();
  });
});

describe("T-37: Google Calendar disconnection", () => {
  it("disconnects Google Calendar successfully", async () => {
    const result = await unlinkGoogleCalendar(userId);

    expect(result).toEqual({
      status: "disconnected",
      message: "Google Calendar desvinculado correctamente"
    });

    expect(mocks.disconnectGoogleCalendar).toHaveBeenCalledOnce();
    expect(mocks.disconnectGoogleCalendar).toHaveBeenCalledWith(
      userId,
      mocks.revokeGoogleToken
    );
  });

  it("uses the correct user ID", async () => {
    await unlinkGoogleCalendar(userId);

    expect(mocks.disconnectGoogleCalendar).toHaveBeenCalledWith(
      userId,
      expect.any(Function)
    );
  });

  it("maps Google revocation failures to a service error", async () => {
    mocks.disconnectGoogleCalendar.mockRejectedValue(
      new GoogleCalendarRevocationError("revocation_failed")
    );

    await expect(unlinkGoogleCalendar(userId))
      .rejects.toMatchObject({
        code: "google_calendar_unavailable"
      });
  });

  it("propagates unexpected database errors", async () => {
    mocks.disconnectGoogleCalendar.mockRejectedValue(
      new Error("database_error")
    );

    await expect(unlinkGoogleCalendar(userId))
      .rejects.toThrow("database_error");
  });
});