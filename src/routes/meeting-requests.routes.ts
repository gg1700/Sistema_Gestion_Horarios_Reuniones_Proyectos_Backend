import { Router } from "express";
import * as MeetingReqController from "../controllers/meeting-requests.controller";
import * as Validations from "../middlewares/validations.middleware";
import * as RateLimit from "../middlewares/rateLimit.middleware";
import * as Session from "../middlewares/session.middleware";

const router = Router();

router.post(
  "/",
  RateLimit.authRateLimit,
  Session.verifySession,
  Session.requireActiveProfileUser,
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
  MeetingReqController.cancelMeetingRequest
);

export default router;