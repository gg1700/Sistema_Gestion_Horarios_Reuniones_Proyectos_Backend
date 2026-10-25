import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env.config";
import { AuthenticationError } from "../helpers/errors.helper";
import * as TokenTypes from "../types/token.types";
import * as AuthTypes from "../types/auth.types";
import { validateProvider } from "../validators/oauth.validator";

const registrationPurpose = "registration";

const registrationExpiresIn = "10m";

export function createSession(userId: string, handleName: string): AuthTypes.Session {
  const payload: TokenTypes.TokenPayload = { userId: userId, handlename: handleName };
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] };
  const token = jwt.sign(payload, env.JWT_SECRET, options);
  return { token: token, expiresIn: env.JWT_EXPIRES_IN };
}

export function verifySession(token: string): TokenTypes.TokenPayload {
  try {
    const decodedToken = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (typeof decodedToken.userId !== "string" || typeof decodedToken.handlename !== "string") {
      throw new AuthenticationError("Sesion invalida");
    }
    return { userId: decodedToken.userId, handlename: decodedToken.handlename };
  } 
  catch {
    throw new AuthenticationError("Sesion invalida o expirada");
  }
}

export function createRegistrationToken(registration: TokenTypes.RegistrationClaims): AuthTypes.Session {
  const payload = { email: registration.email.trim().toLowerCase(), provider: registration.provider, purpose: registrationPurpose };
  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: registrationExpiresIn });
  return { token: token, expiresIn: registrationExpiresIn };
}

export function verifyRegistrationToken(token: string): TokenTypes.RegistrationClaims {
  try {
    const decodedToken = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (decodedToken.purpose !== registrationPurpose || typeof decodedToken.email !== "string") {
      throw new AuthenticationError("Comprobante de registro invalido");
    }
    return { email: decodedToken.email, provider: validateProvider(decodedToken.provider) };
  }
  catch {
    throw new AuthenticationError("Comprobante de registro invalido o expirado");
  }
}
