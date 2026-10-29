import { Request, Response } from "express";
import * as TokenTypes from "../types/token.types";
import * as GeneralValidations from "../validators/general.validator";
import * as AuthService from "../services/auth.service";
import * as OAuthService from "../services/oauth.service";
import * as SessionService from "../services/session.service";
import { readAuthSession } from "../services/auth-session.service";
import { isActiveProfileUser } from "../repositories/profile-read.repository";
import { validateProvider } from "../validators/oauth.validator";
import { AuthenticationError, ValidationError } from "../helpers/errors.helper";
import { env } from "../config/env.config";

export async function viewAccountVinculation(req: Request, res: Response) {
  try {
    const { userId } = req.user as TokenTypes.TokenPayload;
    const validatedUserId = GeneralValidations.validateId(userId);

    const { result, statusCode, message, data } = await AuthService.viewAccountVinculation(validatedUserId);
    if (!result) return res.status(statusCode).json({ success: result, message: message });
    return res.status(200).json({
      success: true,
      message: message,
      data: data
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor: ${(err as Error).message}`
    });
  }
}

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

export async function revokeAccessAccount(req: Request, res: Response) {
  try {
    const { userId } = req.user as TokenTypes.TokenPayload;
    const provider = req.params.provider;
    
    const validatedUserId = GeneralValidations.validateId(userId);
    const validatedProvider = GeneralValidations.validateExternalProvider(provider);

    const { result, statusCode, message } = await AuthService.revokeAccessAccount(validatedUserId, validatedProvider);
    if (!result) return res.status(statusCode).json({ success: result, message: message });
    return res.status(200).json({
      success: true,
      message: `Acceso a cuenta de ${validatedProvider} revocado correctamente`
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor: ${(err as Error).message}`
    });
  }
}

export async function startAuthorization(req: Request, res: Response): Promise<void> {
  res.set("Cache-Control", "no-store");
  try {
    const provider = validateProvider(req.params.provider);
    const intent = req.query.intent === undefined ? "login" : req.query.intent;

    if (intent !== "login" && intent !== "link") {
      res.status(400).json({ success: false, message: "Invalid OAuth intent" });
      return;
    }

    let userId: string | null = null;
    const returnTo = typeof req.query.returnTo === "string" && ["/panel", "/perfil/conexiones", "/perfil/conexiones/github", "/bienvenida"].includes(req.query.returnTo)
      ? req.query.returnTo : intent === "link" ? "/perfil/conexiones" : "/panel";

    res.clearCookie("oauth_flow", {
      httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/api/v1/auth",
    });

    if (intent === "login" && typeof req.signedCookies?.session === "string") {
      try {
        const sessionUser = SessionService.verifySession(req.signedCookies.session);
        const session = await readAuthSession(sessionUser.userId);
        if (session.accounts.some(account => account.provider === provider)) {
          res.clearCookie("oauth_flow", {
            httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/api",
          });
          const authorizationUrl = OAuthService.buildOAuthReturnUrl("success", { provider, intent, returnTo });
          if (req.query.mode === "json") res.status(200).json({ authorizationUrl });
          else res.redirect(302, authorizationUrl);
          return;
        }
      } catch (error) {
        if (!(error instanceof AuthenticationError)) throw error;
      }
    }

    if (intent === "link") {
      const token = req.signedCookies?.session;

      if (typeof token !== "string" || !token) {
        res.status(401).json({
          success: false,
          message: "Sesion requerida",
        });
        return;
      }

      try {
        userId = SessionService.verifySession(token).userId;
      } catch {
        res.status(401).json({
          success: false,
          message: "Sesion invalida o expirada",
        });
        return;
      }

      if (!(await isActiveProfileUser(userId))) {
        res.status(401).json({
          success: false,
          message: "Usuario no disponible",
        });
        return;
      }
    }

    const { authorizationUrl, flow } = OAuthService.generateAuthorization(provider);

    res.cookie("oauth_flow", JSON.stringify({
      ...flow,
      intent,
      userId,
      returnTo,
      issuedAt: Date.now(),
    }), {
      signed: true,
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api",
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
