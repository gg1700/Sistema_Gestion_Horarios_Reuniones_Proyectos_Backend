import { Router } from "express";
import { authRateLimit } from "../middlewares/rateLimit.middleware";
import {connectGoogleCalendar,googleCalendarCallback} from "../controllers/google-calendar-auth.controller";

const router = Router();

router.get("/connect",authRateLimit,connectGoogleCalendar);
router.get("/callback",authRateLimit,googleCalendarCallback);

export default router;
