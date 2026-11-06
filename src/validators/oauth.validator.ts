import { ValidationError } from "../helpers/errors.helper";
import { OAuthProvider } from "../types/oauth.types";

export function validateProvider(value: unknown): OAuthProvider {
  if (value !== "google" && value !== "github") {
    throw new ValidationError("Proveedor OAuth2 no válido");
  }
  return value;
}
