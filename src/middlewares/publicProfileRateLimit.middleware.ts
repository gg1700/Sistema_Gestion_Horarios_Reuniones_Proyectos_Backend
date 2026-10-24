import type { Request, Response, NextFunction } from "express";

interface RateEntry {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, RateEntry>();

export function publicProfileRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const current = attempts.get(ip);

  if (!current || now >= current.resetAt) {
    if (attempts.size >= 5000) {
      for (const [key, entry] of attempts) {
        if (now >= entry.resetAt) {
          attempts.delete(key);
        }
      }

      if (attempts.size >= 5000 && !attempts.has(ip)) {
        return res.status(429).json({
          success: false,
          message: "Demasiadas solicitudes. Intenta nuevamente.",
        });
      }
    }

    attempts.set(ip, {
      count: 1,
      resetAt: now + 60000,
    });

    next();
    return;
  }

  if (current.count >= 10) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));

    return res.status(429).json({
      success: false,
      message: "Demasiadas solicitudes. Intenta nuevamente.",
    });
  }

  current.count++;
  next();
}
