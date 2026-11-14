import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as controller from "../controllers/publicCalendarLink.controller";
import { verifySession } from "../middlewares/session.middleware";

const router = Router();

router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Límite de peticiones excedido" },
}));
router.use(verifySession);

router.get(
  "/",
  controller.getPublicCalendarLink
);

router.patch(
  "/",
  controller.updatePublicCalendarLink
);

export default router;
