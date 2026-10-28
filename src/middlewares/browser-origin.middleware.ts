import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.config";

// Las escrituras con cookie solo admiten el frontend configurado. Clientes API
// sin Origin siguen pudiendo usar sesión/Bearer; los callbacks OAuth usan state.
export function requireBrowserOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.get("Origin");
  if (origin && origin !== new URL(env.FRONTEND_OAUTH_CALLBACK_URL).origin) {
    return res.status(403).json({ success: false, message: "Origen no permitido." });
  }
  next();
}
