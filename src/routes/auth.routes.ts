import { Router } from "express";
import * as RateLimit from "../middlewares/rateLimit.middleware";
import * as Validations from "../middlewares/validations.middleware";
import * as AuthController from "../controllers/auth.controller";

const router = Router();

router.post(
  "/register",
  RateLimit.registerRateLimit,
  Validations.registerUser,
  AuthController.registerUser
);

router.get(
  "/:provider",
  RateLimit.authRateLimit,
  AuthController.startAuthorization
);
export default router;