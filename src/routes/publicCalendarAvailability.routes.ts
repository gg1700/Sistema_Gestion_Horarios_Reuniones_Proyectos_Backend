import { Router } from "express";
import * as controller from "../controllers/publicCalendarAvailability.controller";
import { publicLinkRateLimit } from "../middlewares/rateLimit.middleware";

const router = Router();

router.get(
  "/:handle/availability",
  publicLinkRateLimit,
  controller.getPublicCalendarAvailability,
);

export default router;