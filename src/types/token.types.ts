export interface TokenPayload {
  userId: string;
  handlename: string;  
}

declare module "express-serve-static-core" {
  interface Request {
    user?: TokenPayload;
  }
}