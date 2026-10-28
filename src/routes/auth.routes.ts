import { Router } from "express";
import * as RateLimit from "../middlewares/rateLimit.middleware";
import * as AuthController from "../controllers/auth.controller";
import { oauthCallback } from "../controllers/oauth-callback.controller";
import * as Session from "../middlewares/session.middleware";
import { completeProfile, getAuthSession, logout } from "../controllers/auth-session.controller";
import { requireBrowserOrigin } from "../middlewares/browser-origin.middleware";

const router = Router();

router.get("/session", Session.verifySession, Session.requireActiveProfileUser, getAuthSession);
router.post("/logout", requireBrowserOrigin, logout);
router.patch("/profile", requireBrowserOrigin, RateLimit.authRateLimit, Session.verifySession, Session.requireActiveProfileUser, completeProfile);

router.get(
  "/accounts",
  Session.verifySession,
  Session.requireActiveProfileUser,
  AuthController.viewAccountVinculation
);

router.delete(
  "/accounts/:provider",
  requireBrowserOrigin,
  RateLimit.authRateLimit,
  Session.verifySession,
  Session.requireActiveProfileUser,
  AuthController.revokeAccessAccount
);

router.get(
  "/:provider/callback",
  RateLimit.authRateLimit,
  oauthCallback
);

router.get(
  "/:provider",
  RateLimit.authRateLimit,
  AuthController.startAuthorization
);

export default router;
