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

export default router;