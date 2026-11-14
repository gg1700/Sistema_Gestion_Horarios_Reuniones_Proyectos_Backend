import { Router } from "express";
import * as MeetingReqController from "../controllers/meeting-requests.controller";
import * as Validations from "../middlewares/validations.middleware";
import * as RateLimit from "../middlewares/rateLimit.middleware";
import * as Session from "../middlewares/session.middleware";

const router = Router();

router.post(
  "/",
  RateLimit.publicMeetingRequestRateLimit,
  Session.optionalSession,
  Validations.createMeetingRequest,
  MeetingReqController.createMeetingRequest
);

router.get(
  "/:action",
  Session.verifySession,
  Session.requireActiveProfileUser,
  MeetingReqController.listSentMeetingRequests
);

router.patch(
  "/received/:requestId/decision",
  Session.verifySession,
  Session.requireActiveProfileUser,
  Validations.decideMeetingRequest,
  MeetingReqController.decideMeetingRequest
);

router.patch(
  "/received/:requestId/reschedule",
  Session.verifySession,
  Session.requireActiveProfileUser,
  Validations.rescheduleMeetingRequest,
  MeetingReqController.rescheduleMeetingRequest
);

router.patch(
  "/sent/:requestId/proposal",
  Session.verifySession,
  Session.requireActiveProfileUser,
  Validations.respondToMeetingProposal,
  MeetingReqController.respondToMeetingProposal
);

router.patch(
  "/:requestId",
  Session.verifySession,
  Session.requireActiveProfileUser,
  Validations.updateMeetingRequest,
  MeetingReqController.updateMeetingRequest
);

router.delete(
  "/:requestId",
  Session.verifySession,
  Session.requireActiveProfileUser,
  Validations.cancelMeetingRequest,
  MeetingReqController.cancelMeetingRequest
);

export default router;