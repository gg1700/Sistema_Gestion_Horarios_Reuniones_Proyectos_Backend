import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env.config";
import { AuthenticationError } from "../helpers/errors.helper";
import * as TokenTypes from "../types/token.types";
import * as AuthTypes from "../types/auth.types";

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
