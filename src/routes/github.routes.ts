import { Router } from "express";
import * as GithubController from "../controllers/github.controller";
import * as RateLimit from "../middlewares/rateLimit.middleware";

const router = Router();

router.get(
  "/github/activity/:type",
  RateLimit.githubActivityRateLimit,
  GithubController.requestGithubActivity
);

export default router;