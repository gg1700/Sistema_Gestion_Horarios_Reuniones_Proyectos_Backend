import type { Request, Response } from "express";
import { GithubRepositoryError } from "../services/github-client.service";
import { listGithubRepositories, saveGithubRepositories } from "../services/github-repository.service";

function sendError(res: Response, error: unknown) {
  if (error instanceof GithubRepositoryError) {
    if (error.retryAfter) res.set("Retry-After", String(error.retryAfter));
    return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
  }
  console.error("GitHub repositories failed", { code: (error as { code?: string })?.code });
  return res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: "No se pudieron guardar o consultar tus repositorios." });
}

export async function listRepositories(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  try { return res.json({ success: true, data: await listGithubRepositories(req.user!.userId) }); }
  catch (error) { return sendError(res, error); }
}

export async function saveRepositories(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  try { return res.json({ success: true, data: await saveGithubRepositories(req.user!.userId, req.body) }); }
  catch (error) { return sendError(res, error); }
}
