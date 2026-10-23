import type { Request, Response } from "express";
import { AuthenticationError, ValidationError } from "../helpers/errors.helper";
import { deleteOwnAccount } from "../services/account-deletion.service";
import { validateDeletionConfirmation } from "../validators/account-deletion.validator";

export async function deleteAccount(req: Request, res: Response) {
  res.set("Cache-Control", "private, no-store");
  if (!req.user) return res.status(401).json({ success: false, message: "Sesion no proporcionada" });
  try {
    const confirmation = validateDeletionConfirmation(req.body);
    await deleteOwnAccount(req.user.userId, confirmation);
    return res.status(200).json({ success: true, message: "Cuenta eliminada correctamente" });
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof ValidationError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error("No se pudo completar la eliminacion de la cuenta");
    return res.status(500).json({ success: false, message: "No se pudo eliminar la cuenta" });
  }
}
