import { Router } from "express";
import { createPublicLinkController } from "../controllers/publicLink.controller";
import { publicLinkRepository } from "../repositories/publicLink.repository";
import { PublicLinkService } from "../services/publicLink.service";
import * as Session from "../middlewares/session.middleware";
import { requireRepositoryOrigin } from "../middlewares/repository-origin.middleware";

const router = Router();

const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";

const service = new PublicLinkService(publicLinkRepository, frontendUrl);

const controller = createPublicLinkController(
  service,
  (req) => req.user?.userId ?? null
);

router.use(Session.verifySession, Session.requireActiveProfileUser);

router.get("/", controller.get);
router.get("/availability", controller.checkAvailability);
router.patch("/", requireRepositoryOrigin, controller.update);

export default router;
