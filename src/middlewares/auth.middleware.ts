
import { Request, Response, NextFunction } from "express";
import { verifySession } from "../services/session.service";

export function verifyAuthentication(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Token de autenticacion requerido"
    });
  }

  const token = authorization.substring(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token de autenticacion requerido"
    });
  }

  try {
    req.user = verifySession(token);
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Sesion invalida o expirada"
    });
  }
}
