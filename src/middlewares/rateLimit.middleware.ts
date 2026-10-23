import { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.config";

function sendLimitExceeded(req: Request, res: Response) {
  return res.status(429).json({
    success: false,
    message: "Limite de peticiones excedido, intente nuevamente mas tarde"
  });
}

function createRateLimit(maximumRequests: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: maximumRequests,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: sendLimitExceeded,
    skip: () => env.NODE_ENV === "test"
  });
}

export const registerRateLimit = createRateLimit(10);
