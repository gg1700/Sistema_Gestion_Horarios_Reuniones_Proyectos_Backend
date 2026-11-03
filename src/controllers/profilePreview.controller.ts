import type { Request, Response } from "express";
import { AuthenticationError } from "../helpers/errors.helper";
import * as ProfilePreviewService from "../services/profilePreview.service";

export async function getProfilePreview(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");

  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Usuario no autenticado",
    });
  }

  try {
    const profile = await ProfilePreviewService.getProfilePreview(userId);

    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return res.status(401).json({
        success: false,
        message: "Sesion invalida o usuario no disponible",
      });
    }

    return res.status(500).json({
      success: false,
      message: "No se pudo consultar la vista previa del perfil",
    });
  }
}
