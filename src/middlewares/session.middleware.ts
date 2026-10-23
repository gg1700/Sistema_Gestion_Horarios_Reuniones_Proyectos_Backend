import { Request, Response, NextFunction } from "express";
import * as SessionService from "../services/session.service";

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
