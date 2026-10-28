import { Router } from "express";
import * as Session from "../middlewares/session.middleware";
import * as GithubController from "../controllers/github.controller";
import * as RateLimit from "../middlewares/rateLimit.middleware";

const router = Router();

router.get(
  "/activity/:type",
  RateLimit.githubActivityRateLimit,
  Session.verifySession,
  Session.requireActiveProfileUser,
  GithubController.requestGithubActivity
);

export default router;