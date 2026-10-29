import { Router } from "express";
import * as RateLimit from "../middlewares/rateLimit.middleware";
import * as Validations from "../middlewares/validations.middleware";
import * as AuthController from "../controllers/auth.controller";
import { oauthCallback } from "../controllers/oauth-callback.controller";
import * as Session from "../middlewares/session.middleware";
import { env } from "../config/env.config";
import { requireRepositoryOrigin } from "../middlewares/repository-origin.middleware";

const router = Router();

// Cierre de la cookie actual. No revoca otras copias del JWT.
router.post("/logout", requireRepositoryOrigin, (req, res) => {
  res.clearCookie("session", {httpOnly:true, signed:true, secure:env.NODE_ENV === 'production', sameSite:'lax',path:'/'});
  res.status(204).end();
});

router.get(
  "/accounts",
  Session.verifySession,
  Session.requireActiveProfileUser,
  AuthController.viewAccountVinculation
);

router.delete(
  "/accounts/:provider",
  RateLimit.authRateLimit,
  Session.verifySession,
  Session.requireActiveProfileUser,
  AuthController.revokeAccessAccount
);

router.post(
  "/register",
  RateLimit.registerRateLimit,
  Validations.registerUser,
  AuthController.registerUser
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
