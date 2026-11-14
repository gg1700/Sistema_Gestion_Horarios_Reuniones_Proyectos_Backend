import { Router } from "express";
import { authRateLimit, googleCalendarRateLimit } from "../middlewares/rateLimit.middleware";
import { verifySession, requireActiveProfileUser } from "../middlewares/session.middleware";
import { connectGoogleCalendar, googleCalendarCallback } from "../controllers/google-calendar-auth.controller";
import { getCalendars, selectCalendar, createCalendar, getConnectionStatus, disconnectCalendar } from "../controllers/google-calendar.controller";

const router = Router();

router.get(
  "/connect",
  authRateLimit,
  connectGoogleCalendar
);

router.get(
  "/callback",
  authRateLimit,
  googleCalendarCallback
);

router.get(
  "/calendars",
  verifySession,
  requireActiveProfileUser,
  googleCalendarRateLimit,
  getCalendars
);

router.post(
  "/calendars",
  verifySession,
  requireActiveProfileUser,
  googleCalendarRateLimit,
  createCalendar
);

router.put(
  "/selected",
  verifySession,
  requireActiveProfileUser,
  googleCalendarRateLimit,
  selectCalendar
);

router.get(
  "/status",
  verifySession,
  requireActiveProfileUser,
  googleCalendarRateLimit,
  getConnectionStatus
);

router.delete(
  "/",
  verifySession,
  requireActiveProfileUser,
  googleCalendarRateLimit,
  disconnectCalendar
);

export default router;