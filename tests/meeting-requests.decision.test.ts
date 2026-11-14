import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repo: {
    findRequestForRecipient: vi.fn(),
    lockRecipientUser: vi.fn(),
    hasPublicCalendarActiveWithClient: vi.fn(),
    findRecipientTimezoneWithClient: vi.fn(),
    findAvailableSchedules: vi.fn(),
    findCalendarSchedules: vi.fn(),
    findOtherPendingRequests: vi.fn(),
    findRequesterContact: vi.fn(),
    updateMeetingRequestDecision: vi.fn(),
    createDecisionNotification: vi.fn(),
  },
  createGoogleEvent: vi.fn(),
  deleteGoogleEvent: vi.fn(),
  synchronizeCalendarEvents: vi.fn(),
  findGoogleCalendarForUser: vi.fn(),
  upsertCalendarEventMirror: vi.fn(),
}));

vi.mock("../src/utils/query", () => ({
  processTransaction: (callback: (client: unknown) => unknown) => callback({}),
  processReturnQuery: vi.fn(),
}));
vi.mock("../src/repositories/meeting-requests.repository", () => mocks.repo);
vi.mock("../src/services/googleCalendarClient.service", () => ({
  createGoogleEvent: mocks.createGoogleEvent,
  deleteGoogleEvent: mocks.deleteGoogleEvent,
}));
vi.mock("../src/services/calendarEvents.service", () => ({
  synchronizeCalendarEvents: mocks.synchronizeCalendarEvents,
}));
vi.mock("../src/repositories/calendarEvents.repository", () => ({
  findGoogleCalendarForUser: mocks.findGoogleCalendarForUser,
  upsertCalendarEventMirror: mocks.upsertCalendarEventMirror,
}));

import { decideMeetingRequest } from "../src/services/meeting-requests.service";

const recipientId = "11111111-1111-4111-8111-111111111111";
const requesterId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
const meetUrl = "https://meet.google.com/abc-defg-hij";

const pendingRequest = {
  id: requestId,
  requester_user_id: requesterId,
  recipient_user_id: recipientId,
  requested_start_at: startsAt,
  requested_end_at: endsAt,
  timezone: "America/Lima",
  title: "Revision Del Proyecto",
  message: "Quisiera revisar el avance del sprint.",
  status: "pending",
  guest_name: null,
  guest_email: null,
};

function googleEventFor(id: string, withMeet: boolean) {
  return {
    id,
    title: pendingRequest.title,
    description: null,
    location: null,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timeZone: "America/La_Paz",
    eventStatus: "confirmed",
    providerUpdatedAt: null,
    meetUrl: withMeet ? meetUrl : null,
  };
}

const connectedCalendar = (connectionId: string) => ({
  connectionId,
  calendarId: "primary",
  calendarName: "Personal",
  timeZone: "America/La_Paz",
  connectionStatus: "connected",
  externalAccountId: "external",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repo.findRequestForRecipient.mockResolvedValue([pendingRequest]);
  mocks.repo.lockRecipientUser.mockResolvedValue(true);
  mocks.repo.hasPublicCalendarActiveWithClient.mockResolvedValue(true);
  mocks.repo.findRecipientTimezoneWithClient.mockResolvedValue([{ timezone: "America/La_Paz" }]);
  mocks.repo.findAvailableSchedules.mockResolvedValue([{ id: "rule" }]);
  mocks.repo.findCalendarSchedules.mockResolvedValue([]);
  mocks.repo.findOtherPendingRequests.mockResolvedValue([]);
  mocks.repo.findRequesterContact.mockResolvedValue([
    { requester_name: "Jessica Quispe", requester_email: "jessica@example.com" },
  ]);
  mocks.repo.updateMeetingRequestDecision.mockImplementation(async () => [{
    ...pendingRequest,
    status: "accepted",
    created_at: new Date(),
    resolved_at: new Date(),
    meet_url: meetUrl,
  }]);
  mocks.repo.createDecisionNotification.mockResolvedValue([{ id: "notification" }]);
  mocks.synchronizeCalendarEvents.mockResolvedValue(connectedCalendar("recipient-connection"));
  mocks.upsertCalendarEventMirror.mockImplementation(async (input: { userId: string }) => ({
    id: input.userId === requesterId ? "requester-mirror" : "recipient-mirror",
  }));
  mocks.createGoogleEvent.mockImplementation(async (userId: string) =>
    googleEventFor(userId === recipientId ? "recipient-event" : "requester-event", userId === recipientId));
});

describe("Aceptacion de solicitudes de reunion", () => {
  it("crea la reunion con Meet en ambos calendarios cuando el solicitante esta conectado", async () => {
    mocks.findGoogleCalendarForUser.mockResolvedValue(connectedCalendar("requester-connection"));

    const result = await decideMeetingRequest(recipientId, requestId, { decision: "accepted" as never });

    expect(result).toMatchObject({ result: true, statusCode: 200, message: "Solicitud de reunion aceptada correctamente" });
    expect(mocks.createGoogleEvent).toHaveBeenNthCalledWith(1, recipientId, expect.objectContaining({ withMeet: true }));
    expect(mocks.createGoogleEvent).toHaveBeenNthCalledWith(2, requesterId, expect.objectContaining({
      location: meetUrl,
      timeZone: "America/Lima",
    }));
    expect(mocks.upsertCalendarEventMirror).toHaveBeenCalledWith(
      expect.objectContaining({ userId: requesterId, calendarConnectionId: "requester-connection", meetUrl }),
      expect.anything(),
    );
    expect(mocks.repo.updateMeetingRequestDecision).toHaveBeenCalledWith(
      requestId, recipientId, "accepted", null, "recipient-mirror", expect.anything(), meetUrl, "requester-mirror");
    expect(mocks.repo.createDecisionNotification).toHaveBeenCalledWith(
      requesterId, recipientId, requestId, "accepted", expect.anything(), meetUrl);
  });

  it("acepta sin crear copia cuando el solicitante no tiene Google Calendar", async () => {
    mocks.findGoogleCalendarForUser.mockResolvedValue(null);

    const result = await decideMeetingRequest(recipientId, requestId, { decision: "accepted" as never });

    expect(result.result).toBe(true);
    expect(mocks.createGoogleEvent).toHaveBeenCalledTimes(1);
    expect(mocks.repo.updateMeetingRequestDecision).toHaveBeenCalledWith(
      requestId, recipientId, "accepted", null, "recipient-mirror", expect.anything(), meetUrl, null);
  });

  it("invita por correo al visitante sin cuenta", async () => {
    mocks.repo.findRequestForRecipient.mockResolvedValue([{
      ...pendingRequest,
      requester_user_id: null,
      guest_name: "Visitante",
      guest_email: "visitante@example.com",
    }]);
    mocks.repo.findRequesterContact.mockResolvedValue([
      { requester_name: "Visitante", requester_email: "visitante@example.com" },
    ]);

    const result = await decideMeetingRequest(recipientId, requestId, { decision: "accepted" as never });

    expect(result.result).toBe(true);
    expect(mocks.createGoogleEvent).toHaveBeenCalledTimes(1);
    expect(mocks.createGoogleEvent).toHaveBeenCalledWith(recipientId, expect.objectContaining({
      withMeet: true,
      attendeeEmails: ["visitante@example.com"],
    }));
    expect(mocks.findGoogleCalendarForUser).not.toHaveBeenCalled();
  });

  it("elimina ambos eventos si no se puede registrar la aceptacion", async () => {
    mocks.findGoogleCalendarForUser.mockResolvedValue(connectedCalendar("requester-connection"));
    mocks.repo.updateMeetingRequestDecision.mockResolvedValue([]);

    const result = await decideMeetingRequest(recipientId, requestId, { decision: "accepted" as never });

    expect(result.result).toBe(false);
    expect(mocks.deleteGoogleEvent).toHaveBeenCalledWith(requesterId, "requester-event");
    expect(mocks.deleteGoogleEvent).toHaveBeenCalledWith(recipientId, "recipient-event");
  });

  it("guarda y notifica el motivo del rechazo", async () => {
    mocks.repo.updateMeetingRequestDecision.mockResolvedValue([{
      ...pendingRequest, status: "rejected", created_at: new Date(), owner_response_message: "Tengo otra reunion",
    }]);

    const result = await decideMeetingRequest(recipientId, requestId, {
      decision: "rejected" as never,
      responseMessage: "Tengo otra reunion",
    });

    expect(result.result).toBe(true);
    expect(mocks.createGoogleEvent).not.toHaveBeenCalled();
    expect(mocks.repo.createDecisionNotification).toHaveBeenCalledWith(
      requesterId, recipientId, requestId, "rejected", expect.anything(), "Tengo otra reunion");
  });
});
