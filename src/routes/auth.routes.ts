import { Router } from "express";
import * as AuthController from "../controllers/auth.controller";
import { authRateLimit } from "../middlewares/auth-rate-limit.middleware";

const router = Router();

router.get("/:provider", authRateLimit, AuthController.startAuthorization);

export default router;
