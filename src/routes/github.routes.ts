import { Router } from "express";
import { verifySession, requireActiveProfileUser } from "../middlewares/session.middleware";
import { authRateLimit } from "../middlewares/rateLimit.middleware";
import { verifyGitHubConnection } from "../services/github-connection.service";
import { GitHubClientError } from "../integrations/github/github.client";

const router = Router();
router.use(verifySession, requireActiveProfileUser, authRateLimit);
/*
GET /api/v1/integrations/github/connection — sin body, sesión del titular.
200 {"success":true,"data":{"connected":true,"username":"octocat",
"permissions":{"canReadPublicRepositories":true,"canReadPrivateRepositories":false},
"checkedAt":"2026-10-28T12:00:00Z"}}
409 GITHUB_NOT_CONNECTED/GITHUB_REAUTH_REQUIRED; 403 permiso;
429 con Retry-After; 502 proveedor no disponible. No lista repositorios todavía.
*/
router.get("/connection", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try { return res.json({ success: true, data: await verifyGitHubConnection(req.user!.userId) }); }
  catch (error) {
    if (error instanceof GitHubClientError) {
      if (error.retryAfterSeconds) res.set("Retry-After", String(error.retryAfterSeconds));
      return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
    }
    return res.status(500).json({ success: false, message: "No se pudo verificar la conexión con GitHub." });
  }
});
export default router;

