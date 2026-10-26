import { Request, Response } from "express";

import * as AuthService from "../services/auth.service";
import * as OAuthService from "../services/oauth.service";
import * as SessionService from "../services/session.service";
import { isActiveProfileUser } from "../repositories/profile-read.repository";
import { validateProvider } from "../validators/oauth.validator";
import { ValidationError } from "../helpers/errors.helper";
import { env } from "../config/env.config";

export async function registerUser(req: Request, res: Response) {
  try {
    const { result, statusCode, message, data } =
      await AuthService.registerUser(req.body);

    if (!result) {
      return res.status(statusCode).json({
        success: result,
        message: message,
      });
    }

    return res.status(201).json({
      success: true,
      message: message,
      data: data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor ${(error as Error).message}`,
    });
  }
}

export async function startAuthorization(req: Request, res: Response): Promise<void> {
  try {
    const provider = validateProvider(req.params.provider);
    const authorization = req.headers.authorization;
    const sessionToken = req.signedCookies?.session;
    let userId: string | null = null;

    if (authorization || sessionToken) {
      const token = authorization?.startsWith("Bearer ")
        ? authorization.slice(7).trim()
        : typeof sessionToken === "string" ? sessionToken : "";

      if (!token) {
        res.status(401).json({ success: false, message: "Sesion invalida" });
        return;
      }

      try {
        userId = SessionService.verifySession(token).userId;
      } catch {
        res.status(401).json({ success: false, message: "Sesion invalida" });
        return;
      }

      if (!(await isActiveProfileUser(userId))) {
        res.status(401).json({ success: false, message: "Usuario no disponible" });
        return;
      }
    }

    const { authorizationUrl, flow } = OAuthService.generateAuthorization(provider);

    res.cookie("oauth_flow", JSON.stringify({ ...flow, userId, issuedAt: Date.now() }), {
      signed: true,
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/auth",
      maxAge: 5 * 60 * 1000,
    });

    if (req.query.mode === "json") {
      res.status(200).json({ authorizationUrl });
      return;
    }

    res.redirect(302, authorizationUrl);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }

    throw error;
  }
}
