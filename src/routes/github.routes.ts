import { Router } from "express";
import * as Session from "../middlewares/session.middleware";
import * as GithubController from "../controllers/github.controller";
import * as RateLimit from "../middlewares/rateLimit.middleware";
import { listRepositories, saveRepositories } from "../controllers/github-repository.controller";
import { requireRepositoryOrigin } from "../middlewares/repository-origin.middleware";

const router = Router();

router.get(
  "/repositories",
  Session.verifySession,
  Session.requireActiveProfileUser,
  RateLimit.githubActivityRateLimit,
  listRepositories
);

router.put(
  "/repositories/selected", 
  Session.verifySession,
  Session.requireActiveProfileUser,
  requireRepositoryOrigin,
  RateLimit.githubActivityRateLimit,
  saveRepositories
);

router.get(
  "/activity/:type",
  Session.verifySession,
  Session.requireActiveProfileUser,
  RateLimit.githubActivityRateLimit,
  GithubController.requestGithubActivity
);

export default router;
