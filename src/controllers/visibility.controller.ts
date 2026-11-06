
import { Request, Response } from "express";
import * as VisibilityService from "../services/visibility.service";

export async function getVisibility(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Usuario no autenticado"
      });
    }

    const visibility = await VisibilityService.getVisibility(userId);

    return res.status(200).json({
      success: true,
      data: visibility
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Error al consultar la visibilidad del perfil"
    });
  }
}

export async function updateVisibility(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Usuario no autenticado"
      });
    }

    await VisibilityService.updateVisibility(
      userId,
      req.body?.changes
    );

    return res.status(200).json({
      success: true,
      message: "Visibilidad actualizada correctamente"
    });
  } catch (error) {
    if (error instanceof VisibilityService.VisibilityError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error al actualizar la visibilidad"
    });
  }
}
