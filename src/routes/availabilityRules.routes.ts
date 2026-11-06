import { Router } from "express";
import * as controller from "../controllers/availabilityRules.controller";
import { availabilityRulesRateLimit } from "../middlewares/rateLimit.middleware";
import * as session from "../middlewares/session.middleware";

const router = Router();

router.use(
  session.verifySession,
  session.requireActiveProfileUser,
  availabilityRulesRateLimit,
);

router.get("/", controller.getAvailabilityRules);
router.put("/", controller.replaceAvailabilityRules);

export default router;