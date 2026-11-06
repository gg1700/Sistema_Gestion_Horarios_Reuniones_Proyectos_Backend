import { rateLimit } from "express-rate-limit";

export const publicCalendarRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Demasiadas solicitudes. Intenta nuevamente." },
});
