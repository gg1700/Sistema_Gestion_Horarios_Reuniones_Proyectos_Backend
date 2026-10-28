import { Router } from "express";
import { authRateLimit, googleCalendarRateLimit } from "../middlewares/rateLimit.middleware";
import { verifySession, requireActiveProfileUser } from "../middlewares/session.middleware";
import { connectGoogleCalendar, googleCalendarCallback } from "../controllers/google-calendar-auth.controller";
import { getCalendars, selectCalendar } from "../controllers/google-calendar.controller";

const router = Router();

router.get("/connect", authRateLimit, connectGoogleCalendar);
router.get("/callback", authRateLimit, googleCalendarCallback);
router.get("/calendars", googleCalendarRateLimit, verifySession, requireActiveProfileUser, getCalendars);
router.put("/selected", googleCalendarRateLimit, verifySession, requireActiveProfileUser, selectCalendar);

export default router;