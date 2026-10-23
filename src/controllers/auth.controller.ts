import { Request, Response } from "express";

import * as AuthService from "../services/auth.service";
import * as OAuthService from "../services/oauth.service";

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