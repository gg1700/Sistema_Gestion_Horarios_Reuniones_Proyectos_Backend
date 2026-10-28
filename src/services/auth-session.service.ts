import * as repository from "../repositories/auth-session.repository";
import { AuthenticationError, ConflictError, ValidationError } from "../helpers/errors.helper";
import { validatePublicHandle } from "../helpers/publicLink.helper";
import { validateProperNoun } from "../validators/general.validator";
import type { AuthSession } from "../types/auth-session.types";

export async function readAuthSession(userId: string): Promise<AuthSession> {
  const [profile, accounts] = await Promise.all([
    repository.findSessionProfile(userId), repository.findLinkedIdentities(userId),
  ]);
  if (!profile || !accounts.length) throw new AuthenticationError("Inicia sesión con Google o GitHub.");
  return { authenticated: true, profile, accounts };
}

export async function completeAuthProfile(userId: string, body: unknown): Promise<AuthSession> {
  await readAuthSession(userId);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("Revisa tus datos.");
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !["name", "firstSurname", "handleName"].includes(key))) {
    throw new ValidationError("Solo se aceptan nombre, primer apellido e identificador.");
  }
  const handle = validatePublicHandle(input.handleName);
  if (!handle.valid) throw new ValidationError(handle.error);
  const value = {
    name: validateProperNoun(input.name, "Nombre"),
    firstSurname: validateProperNoun(input.firstSurname, "Primer apellido"),
    handleName: handle.handleName,
  };
  if (value.name === "Usuario" || value.firstSurname === "Pendiente") throw new ValidationError("Completa tu nombre y primer apellido.");
  try {
    if (!(await repository.updateSessionProfile(userId, value))) throw new AuthenticationError("Usuario no disponible.");
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new ConflictError("Ese identificador ya está en uso.");
    throw error;
  }
  return readAuthSession(userId);
}

