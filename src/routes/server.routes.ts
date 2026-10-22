import { Router, Request, Response } from "express";
import AuthRoutes from "./auth.routes";

const router = Router();

router.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    message: "Servidor Backend funcionando correctamente..."
  });
});

router.use("/api/v1/auth", AuthRoutes);

router.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Ruta no encontrada..." });
});

export default router;