import { Router, Request, Response } from "express";
import publicLinkRoutes from "./publicLink.routes";
import ProfileRoutes from "./profile.routes";

const router = Router();

router.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    message: "Servidor Backend funcionando correctamente...",
  });
});

router.use("/api/v1/profile/public-link", publicLinkRoutes);
router.use("/api/v1/profile", ProfileRoutes);

router.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Ruta no encontrada..." });
});

export default router;
