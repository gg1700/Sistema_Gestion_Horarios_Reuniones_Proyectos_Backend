import { Request, Response, NextFunction } from "express";
import * as SessionService from "../services/session.service";
import { isActiveProfileUser } from "../repositories/profile-read.repository";

export function verifySession(req: Request, res: Response, next: NextFunction) {
  const authorizationHeader = req.headers.authorization;
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Sesion no proporcionada"
    });
  }
  try {
    const token = authorizationHeader.slice("Bearer ".length).trim();
    req.user = SessionService.verifySession(token);
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: (error as Error).message
    });
  }
}

export function verifyRegistration(req: Request, res: Response, next: NextFunction) {
  const authorizationHeader = req.headers.authorization;
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Comprobante de registro no proporcionado"
    });
  }
  try {
    const token = authorizationHeader.slice("Bearer ".length).trim();
    req.registration = SessionService.verifyRegistrationToken(token);
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: (error as Error).message
    });
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
