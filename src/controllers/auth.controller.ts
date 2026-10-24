import { Request, Response } from "express";
import * as TokenTypes from "../types/token.types";
import * as GeneralValidations from "../validators/general.validator";
import * as AuthService from "../services/auth.service";
import * as OAuthService from "../services/oauth.service";
import { validateProvider } from "../validators/oauth.validator";
import { ValidationError } from "../helpers/errors.helper";
import { env } from "../config/env.config";

export async function viewAccountVinculation(req: Request, res: Response) {
  try {
    const { userId } = req.user as TokenTypes.TokenPayload || req.query;
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
    const { userId } = req.user as TokenTypes.TokenPayload || req.query;
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

export function startAuthorization(req: Request, res: Response): void {
  try {
    const provider = validateProvider(req.params.provider);

    const { authorizationUrl, flow } =
      OAuthService.generateAuthorization(provider);

    res.cookie("oauth_flow", JSON.stringify(flow), {
      signed: true,
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/auth",
      maxAge: 5 * 60 * 1000,
    });

    res.redirect(302, authorizationUrl);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    throw error;
  }
}