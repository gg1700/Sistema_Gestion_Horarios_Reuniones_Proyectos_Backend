import { Router, Request, Response } from "express";
import publicLinkRoutes from "./publicLink.routes";
import ProfileRoutes from "./profile.routes";
import * as ProfileController from "../controllers/profile.controller";
import { publicProfileRateLimit } from "../middlewares/publicProfileRateLimit.middleware";
import AuthRoutes from "./auth.routes";
import GoogleCalendarRoutes from "./google-calendar.routes";
import GitHubRoutes from "./github.routes";
import { oauthCallback } from "../controllers/oauth-callback.controller";
import { authRateLimit } from "../middlewares/rateLimit.middleware";
const router = Router();

router.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    message: "Servidor Backend funcionando correctamente...",
  });
});

router.use("/api/v1/profile/public-link", publicLinkRoutes);
router.use("/api/v1/profile", ProfileRoutes);
router.use("/api/v1/auth", AuthRoutes)
router.use("/api/v1/integrations/google-calendar",GoogleCalendarRoutes);
router.use("/api/v1/integrations/github", GitHubRoutes);
router.get("/api/auth/github/callback", authRateLimit, (req, res) => {
  req.params.provider = "github";
  return oauthCallback(req, res);
});
router.get(
  "/api/v1/public/profiles/:handle",
  publicProfileRateLimit,
  ProfileController.getPublicProfile
);

router.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Ruta no encontrada..." });
});

export default router;
