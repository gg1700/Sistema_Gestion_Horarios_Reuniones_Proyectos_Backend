import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.config";

export function requireRepositoryOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.get("origin");
  if ((origin && origin !== new URL(env.FRONTEND_OAUTH_CALLBACK_URL).origin) || req.get("sec-fetch-site") === "cross-site") {
    return res.status(403).json({ success: false, message: "Origen no permitido." });
  }
  if (!req.is("application/json")) return res.status(415).json({ success: false, message: "Envía JSON." });
  next();
}
