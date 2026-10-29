import { Router } from "express";
import * as Session from "../middlewares/session.middleware";
import * as GithubController from "../controllers/github.controller";
import * as RateLimit from "../middlewares/rateLimit.middleware";
import { listRepositories, saveRepositories } from "../controllers/github-repository.controller";
import { requireRepositoryOrigin } from "../middlewares/repository-origin.middleware";

const router = Router();

// GET: {success:true,data:{repositories:[{id,name,description,language,stars,url,private,visibility,selected,selectionId,visible}],selectedIds:[123],maxSelected:5,username,warnings:[]}}
router.get("/repositories", Session.verifySession, Session.requireActiveProfileUser, RateLimit.githubActivityRateLimit, listRepositories);
// PUT JSON {repositoryIds:[123,456]}: 0..5 IDs propios, públicos y distintos; orden del array.
// Sesión obligatoria. 422 selección inválida; 409 conectar/reautorizar; 429 cuota; 502 GitHub.
router.put("/repositories/selected", Session.verifySession, Session.requireActiveProfileUser, requireRepositoryOrigin, RateLimit.githubActivityRateLimit, saveRepositories);

router.get(
  "/activity/:type",
  RateLimit.githubActivityRateLimit,
  Session.verifySession,
  Session.requireActiveProfileUser,
  GithubController.requestGithubActivity
);

export default router;
