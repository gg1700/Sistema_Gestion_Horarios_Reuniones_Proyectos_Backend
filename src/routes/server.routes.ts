import { Router, Request, Response } from "express";
import ProfileRoutes from "./profile.routes";
import * as ProfileController from "../controllers/profile.controller";
import { publicProfileRateLimit } from "../middlewares/publicProfileRateLimit.middleware";
import AuthRoutes from "./auth.routes";

const router = Router();

router.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    message: "Servidor Backend funcionando correctamente...",
  });
});

router.use("/api/v1/profile", ProfileRoutes);
router.use("/api/v1/auth", AuthRoutes);

router.get(
  "/api/v1/public/profiles/:handle",
  publicProfileRateLimit,
  ProfileController.getPublicProfile
);

router.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Ruta no encontrada..." });
});

export default router;
