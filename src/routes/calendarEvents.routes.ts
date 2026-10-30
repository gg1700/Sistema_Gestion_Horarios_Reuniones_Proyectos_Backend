import { Router } from "express";
import * as CalendarEventsController from "../controllers/calendarEvents.controller";
import * as Session from "../middlewares/session.middleware";
import { googleCalendarRateLimit } from "../middlewares/rateLimit.middleware";

const router = Router();

router.use(
  Session.verifySession,
  Session.requireActiveProfileUser,
  googleCalendarRateLimit,
);

router.get("/", CalendarEventsController.listCalendarEvents);
router.post("/", CalendarEventsController.createCalendarEvent);
router.patch("/:eventId", CalendarEventsController.updateCalendarEvent);
router.delete("/:eventId", CalendarEventsController.deleteCalendarEvent);

export default router;