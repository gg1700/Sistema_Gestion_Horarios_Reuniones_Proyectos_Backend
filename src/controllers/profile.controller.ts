import { Request, Response } from "express";
import * as GeneralValidations from "../validators/general.validator";
import * as ProfileService from "../services/profile.service";
import * as TokenTypes from "../types/token.types";
import { AuthenticationError } from "../helpers/errors.helper";
import type { ProfileResponse } from "../types/profile-response.types";

export async function getOwnProfile(req: Request, res: Response<ProfileResponse>) {
  res.set("Cache-Control", "private, no-store");
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Sesion no proporcionada" });
  }
  try {
    const profile = await ProfileService.getOwnProfile(req.user.userId);
    return res.status(200).json({ success: true, data: profile });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return res.status(401).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "No se pudo consultar el perfil" });
  }
}

export async function modifyPersonalInfo(req: Request, res: Response) {
  try {
    const { userId } = req.user as TokenTypes.TokenPayload;
    const validatedUserId = GeneralValidations.validateId(userId);

    if ((!req.body || Object.keys(req.body).length === 0) && !req.file) {
      return res.status(400).json({
        success: false,
        message: "Infomacion a modificar no especificada",
      });
    }
    
    const { result, statusCode, message } = await ProfileService.modifyPersonalInfo(validatedUserId, req.body, req.file);
    if (!result) return res.status(statusCode).json({ success: result, message: message });
    return res.status(200).json({
      success: true,
      message: "Informacion personal modificada correctamente",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor ${(err as Error).message}`,
    });
  }
}

export async function modifyWorkExperience(req: Request, res: Response) {
  try {
    const { userId } = req.user as TokenTypes.TokenPayload;
    const id = req.params.id;

    const validatedUserId = GeneralValidations.validateId(userId);
    const validatedId = GeneralValidations.validateId(id);

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Infomacion a modificar no especificada",
      });
    }

    const { result, statusCode, message } = await ProfileService.modifyWorkExperience(validatedId, validatedUserId, req.body);
    if (!result) return res.status(statusCode).json({ success: result, message: message });
    return res.status(200).json({
      success: true,
      message: "Informacion personal modificada correctamente",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor: ${(err as Error).message}`,
    });
  }
}

export async function getPublicProfile(req: Request, res: Response) {
  const handle = req.params.handle;

  if (typeof handle !== "string" || !/^[a-z0-9-]{3,50}$/i.test(handle)) {
    return res.status(404).json({
      success: false,
      message: "Perfil no encontrado.",
    });
  }

  try {
    const profile = await ProfileService.getPublicProfile(handle);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Perfil no encontrado.",
      });
    }

    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "No se pudo consultar el perfil.",
    });
  }
}

export async function createAdditionalInfo(req: Request, res: Response) {
  try {
    const { userId } = req.user as TokenTypes.TokenPayload;
    const { result, statusCode, message } =
      await ProfileService.createAdditionalInfo(userId, req.body, req.file);

    if (!result) {
      return res.status(statusCode).json({
        success: result,
        message: message,
      });
    }

    return res.status(201).json({
      success: true,
      message: message,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor ${(error as Error).message}`,
    });
  }
}
