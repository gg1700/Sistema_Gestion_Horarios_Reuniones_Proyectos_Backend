import { Router, type Request } from "express";
import { createPublicLinkController } from "../controllers/publicLink.controller";
import { publicLinkRepository } from "../services/publicLink.repository";
import { PublicLinkService } from "../services/publicLink.service";

type AuthenticatedRequest = Request & {
  user?: { userId?: unknown };
};

const router = Router();

const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";

const service = new PublicLinkService(publicLinkRepository, frontendUrl);

const controller = createPublicLinkController(service, (req: Request) => {
  const userId = (req as AuthenticatedRequest).user?.userId;

  return typeof userId === "string" ? userId : null;
});

router.get("/", controller.get);
router.get("/availability", controller.checkAvailability);
router.patch("/", controller.update);

export default router;
