import { Request, Response, NextFunction } from "express";
import * as SessionService from "../services/session.service";
import { isActiveProfileUser } from "../repositories/profile-read.repository";

export function verifySession(req: Request, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;
  const cookieToken = req.signedCookies?.session;

  if (cookieToken === false) {
    return res.status(401).json({ success: false, message: "Sesion invalida" });
  }

  if (authorization && !authorization.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Autorizacion invalida" });
  }

  const token = authorization
    ? authorization.slice(7).trim()
    : typeof cookieToken === "string" ? cookieToken : "";

  if (!token) {
    return res.status(401).json({ success: false, message: "Sesion no proporcionada" });
  }

  try {
    req.user = SessionService.verifySession(token);
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Sesion invalida o expirada" });
  }
}

export async function requireActiveProfileUser(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.userId;
  if (!userId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(userId)) {
    return res.status(401).json({ success: false, message: "Sesion invalida" });
  }

  try {
    if (!(await isActiveProfileUser(userId))) {
      return res.status(401).json({
        success: false,
        message: "Sesion invalida o usuario no disponible",
      });
    }
    next();
  } catch {
    return res.status(500).json({ success: false, message: "No se pudo verificar la sesion" });
  }
}
