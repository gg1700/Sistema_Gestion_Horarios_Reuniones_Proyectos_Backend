import type { Request, Response } from "express";
import { env } from "../config/env.config";
import { ServerError } from "../helpers/errors.helper";
import { completeAuthProfile, readAuthSession } from "../services/auth-session.service";
import { createSession } from "../services/session.service";

function failure(res: Response, error: unknown) {
  const status = error instanceof ServerError ? error.statusCode : 500;
  return res.status(status).json({ success: false, message: status === 500 ? "No se pudo consultar la sesión." : (error as Error).message });
}

export async function getAuthSession(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  try { return res.json({ success: true, data: await readAuthSession(req.user!.userId) }); }
  catch (error) { return failure(res, error); }
}

export async function completeProfile(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  try {
    const data = await completeAuthProfile(req.user!.userId, req.body);
    const session = createSession(data.profile.id, data.profile.handleName);
    res.cookie("session", session.token, { signed: true, httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 24 * 60 * 60 * 1000 });
    return res.json({ success: true, data });
  } catch (error) { return failure(res, error); }
}

export function logout(_req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  res.clearCookie("session", { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  return res.status(204).end();
}

