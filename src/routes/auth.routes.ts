import { Router } from "express";
import * as AuthController from "../controllers/auth.controller";

const router = Router();

router.get(
  "/accounts",
  AuthController.viewAccountVinculation
);

router.delete(
  "/accounts/:provider",
  AuthController.revokeAccessAccount
);

export default router;