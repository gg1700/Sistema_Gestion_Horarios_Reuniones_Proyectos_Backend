import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/config/server.config";
import pool from "../src/config/database.config";
import { decryptToken } from "../src/utils/token";

// Prueba real de HTTP, cookies, PKCE/state, SQL y cifrado. Solo el proveedor
// externo se simula: no usa cuentas, tokens ni autorizaciones personales.
const agent = request.agent(app);
const marker = "phase1-auth@example.test";
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "x-oauth-scopes": "read:user,user:email" } });
let ownerId = "";
const enabled = process.env.LOCAL_DB_URL?.includes('/orbitia_auth_test') === true;
beforeAll(async () => {
  if (!enabled) return;
  const target = new URL(process.env.LOCAL_DB_URL!);
  if (target.port !== "5433" || target.pathname !== "/orbitia_auth_test" || !['localhost', '127.0.0.1'].includes(target.hostname)) {
    throw new Error("Esta suite solo admite la base Docker orbitia_auth_test en localhost:5433.");
  }
  await pool.query(`DELETE FROM public."user" WHERE email = $1`, [marker]);
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === "https://github.com/login/oauth/access_token") return response({ access_token: "fake-github-token", scope: "read:user,user:email" });
    if (url === "https://api.github.com/user") return response({ id: 430045001, login: "phase1-auth", name: "Ana Perez", html_url: "https://github.com/phase1-auth" });
    if (url === "https://api.github.com/user/emails") return response([{ email: marker, primary: true, verified: true }]);
    if (url === "https://oauth2.googleapis.com/token") return response({ access_token: "fake-google-token", scope: "openid email profile" });
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") return response({ sub: "phase1-google", name: "Ana Perez", email: "different-google@example.test", email_verified: true });
    if (url === "https://oauth2.googleapis.com/revoke") return response({});
    if (url.startsWith("https://api.github.com/applications/") && url.endsWith("/grant")) return new Response(null, { status: 204 });
    throw new Error("Unexpected provider request");
  }));
});
afterAll(async () => {
  if (!enabled) return;
  vi.unstubAllGlobals();
  if (ownerId) await pool.query(`DELETE FROM public."user" WHERE id = $1`, [ownerId]);
  await pool.query(`DELETE FROM public.email WHERE address = $1`, [marker]);
  await pool.end();
});

async function authorize(provider: "github" | "google", intent: "login" | "link", legacy = false) {
  const start = await agent.get(`/api/v1/auth/${provider}`).query({ mode: "json", intent, returnTo: "/perfil/conexiones" });
  expect(start.status).toBe(200);
  const url = new URL(start.body.authorizationUrl);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  const callback = legacy ? "/api/auth/github/callback" : `/api/v1/auth/${provider}/callback`;
  const result = await agent.get(callback).query({ code: "fake-code", state: url.searchParams.get("state") });
  expect(result.status).toBe(302);
  expect(new URL(result.headers.location).searchParams.get("oauth")).toBe("success");
  expect(new URL(result.headers.location).pathname).toBe("/acceso");
  expect(new URL(result.headers.location).searchParams.get("returnTo")).toBe("/perfil/conexiones");
}

describe.skipIf(!enabled)("Fase 1 contra PostgreSQL Docker", () => {
  it("supports GitHub login, verification, both identities, Google login and logout", async () => {
    await authorize("github", "login", true);
    const session = await agent.get("/api/v1/auth/session");
    expect(session.status).toBe(200);
    ownerId = session.body.data.profile.id;
    expect(session.body.data.accounts.map((item: { provider: string }) => item.provider)).toEqual(["github"]);
    expect(session.headers["cache-control"]).toBe("no-store");
    const { rows } = await pool.query(`SELECT access_token FROM public.external_account WHERE user_id = $1`, [ownerId]);
    expect(rows[0].access_token).not.toBe("fake-github-token");
    expect(decryptToken(rows[0].access_token)).toBe("fake-github-token");
    const verification = await agent.get("/api/v1/integrations/github/connection");
    expect(verification.status).toBe(200);
    expect(verification.body.data.username).toBe("phase1-auth");
    expect(verification.body.data.permissions.canReadPrivateRepositories).toBe(false);
    expect(JSON.stringify(verification.body)).not.toContain("token");

    await authorize("google", "link");
    const linked = await agent.get("/api/v1/auth/session");
    expect(linked.body.data.profile.id).toBe(ownerId);
    expect(linked.body.data.accounts.map((item: { provider: string }) => item.provider)).toEqual(["github", "google"]);
    await authorize("google", "login");
    expect((await agent.get("/api/v1/auth/session")).body.data.profile.id).toBe(ownerId);

    const modified = await agent.patch("/api/v1/auth/profile").send({ name: "Ana Maria", firstSurname: "Perez", handleName: "phase1-auth-updated" });
    expect(modified.status).toBe(200);
    expect(modified.body.data.profile.handleName).toBe("phase1-auth-updated");
    const removed = await agent.delete("/api/v1/auth/accounts/google");
    expect(removed.status).toBe(200);
    expect((await agent.get("/api/v1/auth/session")).body.data.accounts.length).toBe(1);
    expect((await agent.delete("/api/v1/auth/accounts/github")).status).toBe(409);
    expect((await agent.post("/api/v1/auth/logout")).status).toBe(204);
    expect((await agent.get("/api/v1/auth/session")).status).toBe(401);
  });
  it("never removes both login options during concurrent unlink requests", async () => {
    await authorize("github", "login", true);
    await authorize("google", "link");
    const results = await Promise.all([
      agent.delete("/api/v1/auth/accounts/google"),
      agent.delete("/api/v1/auth/accounts/github"),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect((await agent.get("/api/v1/auth/session")).body.data.accounts.length).toBe(1);
  });
});
