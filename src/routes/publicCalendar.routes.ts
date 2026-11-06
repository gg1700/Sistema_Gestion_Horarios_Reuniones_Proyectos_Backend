import { Router } from "express";
import { getPublicCalendar } from "../controllers/publicCalendar.controller";
import { publicCalendarRateLimit } from "../middlewares/publicCalendarRateLimit.middleware";

const router = Router();

router.get("/:handle", publicCalendarRateLimit, getPublicCalendar);

export default router;
