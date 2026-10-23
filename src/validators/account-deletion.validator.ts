import { ValidationError } from "../helpers/errors.helper";
import { validateObject } from "./general.validator";

export function validateDeletionConfirmation(body: unknown): string {
  const { confirmation } = validateObject(body, "Confirmacion");
  if (typeof confirmation !== "string" || !confirmation.trim() || confirmation.length > 200) {
    throw new ValidationError("Envia uno de tus correos o la palabra ELIMINAR en confirmation");
  }
  return confirmation.trim();
}
