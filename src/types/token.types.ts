import { OAuthProvider } from "./oauth.types";

export interface RegistrationClaims {
  email: string;
  provider: OAuthProvider;
}

export interface TokenPayload {
  userId: string;
  handlename: string;  
}

declare module "express-serve-static-core" {
  interface Request {
    user?: TokenPayload;
    registration?: RegistrationClaims;
  }
}