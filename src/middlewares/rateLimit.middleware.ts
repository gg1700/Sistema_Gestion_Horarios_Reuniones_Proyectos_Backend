import { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.config";

const fifteenMinutes = 15 * 60 * 1000;

function sendLimitExceeded(req: Request, res: Response) {
  return res.status(429).json({
    success: false,
    message: "Limite de peticiones excedido, intente nuevamente mas tarde",
  });
}

function createRateLimit(maximumRequests: number) {
  return rateLimit({
    windowMs: fifteenMinutes,
    limit: maximumRequests,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: sendLimitExceeded,
    skip: () => env.NODE_ENV === "test",
  });
}

export const registerRateLimit = createRateLimit(10);
export const visibilityRateLimit = createRateLimit(30);
export const profileRateLimit = createRateLimit(20);

export const deleteAccountRateLimit = createRateLimit(5);

export const authRateLimit = createRateLimit(20);
export const googleCalendarRateLimit = createRateLimit(30);
