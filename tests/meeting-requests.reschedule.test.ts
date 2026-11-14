import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repo: {
    findRequestForRecipient: vi.fn(),
    findRequestForRequester: vi.fn(),
    lockRecipientUser: vi.fn(),
    hasPublicCalendarActiveWithClient: vi.fn(),
    findRecipientTimezoneWithClient: vi.fn(),
    findAvailableSchedules: vi.fn(),
    findCalendarSchedules: vi.fn(),
    findOtherPendingRequests: vi.fn(),
    findRequesterContact: vi.fn(),
    updateMeetingRequestDecision: vi.fn(),
    createDecisionNotification: vi.fn(),
    proposeReschedule: vi.fn(),
    moveRequestSchedule: vi.fn(),
    applyProposal: vi.fn(),
    restoreProposal: vi.fn(),
    counterProposal: vi.fn(),
    createRescheduleNotification: vi.fn(),
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

import { proposeReschedule, respondToProposal } from "../src/services/meeting-requests.service";
import { ProposalAnswer } from "../src/types/meeting-requests.types";

const recipientId = "11111111-1111-4111-8111-111111111111";
const requesterId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const day = 24 * 60 * 60 * 1000;
const startsAt = new Date(Date.now() + 2 * day);
const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
const newStart = new Date(Date.now() + 3 * day);
const newEnd = new Date(newStart.getTime() + 30 * 60 * 1000);

const pendingRequest = {
  id: requestId,
  requester_user_id: requesterId,
  recipient_user_id: recipientId,
  requested_start_at: startsAt,
  requested_end_at: endsAt,
  timezone: "America/Lima",
  title: "Revision Del Proyecto",
  message: null,
  status: "pending",
  guest_name: null,
  guest_email: null,
};

const proposedRequest = {
  ...pendingRequest,
  status: "reschedule_proposed",
  proposed_start_at: newStart,
  proposed_end_at: newEnd,
  proposal_message: "Ese dia tengo clases",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repo.lockRecipientUser.mockResolvedValue(true);
  mocks.repo.hasPublicCalendarActiveWithClient.mockResolvedValue(true);
  mocks.repo.findRecipientTimezoneWithClient.mockResolvedValue([{ timezone: "America/La_Paz" }]);
  mocks.repo.findAvailableSchedules.mockResolvedValue([{ id: "rule" }]);
  mocks.repo.findCalendarSchedules.mockResolvedValue([]);
  mocks.repo.findOtherPendingRequests.mockResolvedValue([]);
  mocks.repo.createRescheduleNotification.mockResolvedValue([{ id: "notification" }]);
  mocks.repo.createDecisionNotification.mockResolvedValue([{ id: "notification" }]);
  mocks.repo.findRequesterContact.mockResolvedValue([{ requester_name: "Jessica", requester_email: "j@example.com" }]);
  mocks.synchronizeCalendarEvents.mockResolvedValue({
    connectionId: "c1", calendarId: "primary", calendarName: "Personal", timeZone: "America/La_Paz",
    connectionStatus: "connected", externalAccountId: "x",
  });
  mocks.findGoogleCalendarForUser.mockResolvedValue(null);
  mocks.upsertCalendarEventMirror.mockResolvedValue({ id: "mirror" });
  mocks.createGoogleEvent.mockResolvedValue({
    id: "event", title: "t", description: null, location: null, startsAt: newStart.toISOString(),
    endsAt: newEnd.toISOString(), timeZone: "America/La_Paz", eventStatus: "confirmed",
    providerUpdatedAt: null, meetUrl: "https://meet.google.com/abc-defg-hij",
  });
});

describe("Proponer otro horario", () => {
  it("deja la solicitud a la espera del solicitante y le notifica", async () => {
    mocks.repo.findRequestForRecipient.mockResolvedValue([pendingRequest]);
    mocks.repo.proposeReschedule.mockResolvedValue([{ ...proposedRequest, created_at: new Date() }]);

    const result = await proposeReschedule(recipientId, requestId, { startsAt: newStart, endsAt: newEnd, message: "Ese dia tengo clases" });

    expect(result).toMatchObject({ result: true, statusCode: 200 });
    expect(mocks.repo.proposeReschedule).toHaveBeenCalledWith(requestId, recipientId, newStart, newEnd, "Ese dia tengo clases", expect.anything());
    expect(mocks.repo.createRescheduleNotification).toHaveBeenCalledWith(
      requesterId, recipientId, requestId, "meeting_request_rescheduled", "Nuevo horario propuesto",
      expect.stringContaining("Ese dia tengo clases"), expect.anything(), expect.anything());
    expect(mocks.createGoogleEvent).not.toHaveBeenCalled();
  });

  it("rechaza un horario fuera de la disponibilidad", async () => {
    mocks.repo.findRequestForRecipient.mockResolvedValue([pendingRequest]);
    mocks.repo.findAvailableSchedules.mockResolvedValue([]);

    const result = await proposeReschedule(recipientId, requestId, { startsAt: newStart, endsAt: newEnd });

    expect(result).toMatchObject({ result: false, statusCode: 409 });
    expect(mocks.repo.proposeReschedule).not.toHaveBeenCalled();
  });

  it("no permite proponer sobre solicitudes ya resueltas", async () => {
    mocks.repo.findRequestForRecipient.mockResolvedValue([{ ...pendingRequest, status: "accepted" }]);

    const result = await proposeReschedule(recipientId, requestId, { startsAt: newStart, endsAt: newEnd });

    expect(result).toMatchObject({ result: false, statusCode: 409 });
  });

  it("con un visitante confirma directamente el nuevo horario e invita por correo", async () => {
    const guestRequest = { ...pendingRequest, requester_user_id: null, guest_name: "Visitante", guest_email: "v@example.com" };
    const moved = { ...guestRequest, requested_start_at: newStart, requested_end_at: newEnd };
    mocks.repo.findRequestForRecipient.mockResolvedValueOnce([guestRequest]).mockResolvedValue([moved]);
    mocks.repo.moveRequestSchedule.mockResolvedValue([moved]);
    mocks.repo.findRequesterContact.mockResolvedValue([{ requester_name: "Visitante", requester_email: "v@example.com" }]);
    mocks.repo.updateMeetingRequestDecision.mockResolvedValue([{ ...moved, status: "accepted", created_at: new Date() }]);

    const result = await proposeReschedule(recipientId, requestId, { startsAt: newStart, endsAt: newEnd });

    expect(result.result).toBe(true);
    expect(result.message).toContain("invitacion");
    expect(mocks.repo.moveRequestSchedule).toHaveBeenCalledWith(requestId, recipientId, newStart, newEnd, expect.anything());
    expect(mocks.createGoogleEvent).toHaveBeenCalledWith(recipientId, expect.objectContaining({
      startsAt: newStart.toISOString(), attendeeEmails: ["v@example.com"], withMeet: true,
    }));
    expect(mocks.repo.proposeReschedule).not.toHaveBeenCalled();
  });
});

describe("Responder a la propuesta", () => {
  it("al aceptar aplica el horario propuesto y confirma la reunion", async () => {
    const applied = { ...pendingRequest, requested_start_at: newStart, requested_end_at: newEnd };
    mocks.repo.findRequestForRequester.mockResolvedValue([proposedRequest]);
    mocks.repo.applyProposal.mockResolvedValue([applied]);
    mocks.repo.findRequestForRecipient.mockResolvedValue([applied]);
    mocks.repo.updateMeetingRequestDecision.mockResolvedValue([{ ...applied, status: "accepted", created_at: new Date() }]);

    const result = await respondToProposal(requesterId, requestId, { decision: ProposalAnswer.ACCEPTED });

    expect(result).toMatchObject({ result: true, message: "Nuevo horario aceptado; la reunion quedo confirmada" });
    expect(mocks.createGoogleEvent).toHaveBeenCalledWith(recipientId, expect.objectContaining({ startsAt: newStart.toISOString() }));
    expect(mocks.repo.createRescheduleNotification).toHaveBeenCalledWith(
      recipientId, requesterId, requestId, "meeting_request_reschedule_answered", "Nuevo horario aceptado",
      expect.any(String), expect.anything(), expect.anything());
    expect(mocks.repo.restoreProposal).not.toHaveBeenCalled();
  });

  it("si no se puede confirmar, restaura la propuesta", async () => {
    const applied = { ...pendingRequest, requested_start_at: newStart, requested_end_at: newEnd };
    mocks.repo.findRequestForRequester.mockResolvedValue([proposedRequest]);
    mocks.repo.applyProposal.mockResolvedValue([applied]);
    mocks.repo.findRequestForRecipient.mockResolvedValue([applied]);
    mocks.repo.findCalendarSchedules.mockResolvedValue([{ id: "busy" }]);

    const result = await respondToProposal(requesterId, requestId, { decision: ProposalAnswer.ACCEPTED });

    expect(result.result).toBe(false);
    expect(mocks.repo.restoreProposal).toHaveBeenCalledWith(requestId, expect.objectContaining({
      requestedStart: startsAt, proposedStart: newStart, message: "Ese dia tengo clases",
    }), expect.anything());
  });

  it("puede proponer otro horario y la solicitud vuelve a quedar pendiente", async () => {
    const counterStart = new Date(Date.now() + 4 * day);
    const counterEnd = new Date(counterStart.getTime() + 30 * 60 * 1000);
    mocks.repo.findRequestForRequester.mockResolvedValue([proposedRequest]);
    mocks.repo.counterProposal.mockResolvedValue([{ ...pendingRequest, requested_start_at: counterStart, requested_end_at: counterEnd, created_at: new Date() }]);

    const result = await respondToProposal(requesterId, requestId, {
      decision: ProposalAnswer.COUNTER, startsAt: counterStart, endsAt: counterEnd, timeZone: "America/Lima",
    });

    expect(result).toMatchObject({ result: true, statusCode: 200 });
    expect(mocks.repo.counterProposal).toHaveBeenCalledWith(requestId, requesterId, counterStart, counterEnd, "America/Lima", expect.anything());
    expect(mocks.repo.createRescheduleNotification).toHaveBeenCalledWith(
      recipientId, requesterId, requestId, "meeting_request_reschedule_answered", "El solicitante propuso otro horario",
      expect.any(String), expect.anything(), expect.anything());
  });

  it("no acepta responder si no hay una propuesta", async () => {
    mocks.repo.findRequestForRequester.mockResolvedValue([pendingRequest]);

    const result = await respondToProposal(requesterId, requestId, { decision: ProposalAnswer.ACCEPTED });

    expect(result).toMatchObject({ result: false, statusCode: 409 });
    expect(mocks.repo.applyProposal).not.toHaveBeenCalled();
  });
});
