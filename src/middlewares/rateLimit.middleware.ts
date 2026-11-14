import { Request, Response } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env.config";
import { isIP } from "node:net";

const fifteenMinutes = 15 * 60 * 1000;

function sendLimitExceeded(req: Request, res: Response) {
  return res.status(429).json({
    success: false,
    message: "Has realizado demasiadas solicitudes. Espera un momento e inténtalo nuevamente."
  });
}

function createRateLimit(maximumRequests: number) {
  return rateLimit({
    windowMs: fifteenMinutes,
    limit: maximumRequests,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: sendLimitExceeded,

    keyGenerator: (req: Request) => {
      if (req.user?.userId) {
        return `user:${req.user.userId}`;
      }

      const forwardedIp = req.get("CF-Connecting-IP");

      const clientIp =
        forwardedIp && isIP(forwardedIp)
          ? forwardedIp
          : req.ip ??
          req.socket?.remoteAddress ??
          "127.0.0.1";

      return `ip:${ipKeyGenerator(clientIp)}`;
    },

    skip: () => env.NODE_ENV === "test"
  });
}

export const registerRateLimit = createRateLimit(10);
export const visibilityRateLimit = createRateLimit(60);
export const profileRateLimit = createRateLimit(40);
export const deleteAccountRateLimit = createRateLimit(5);
export const authRateLimit = createRateLimit(30);

export const githubActivityRateLimit = createRateLimit(60);
export const googleCalendarRateLimit = createRateLimit(120);

export const availabilityRulesRateLimit = createRateLimit(60);
export const publicLinkRateLimit = createRateLimit(120);
export const publicMeetingRequestRateLimit = createRateLimit(20);