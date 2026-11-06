import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import { randomUUID, createHmac } from "node:crypto";
import pool from "../src/config/database.config";
import { app } from "../src/config/server.config";
import { createSession } from "../src/services/session.service";
import { encryptToken } from "../src/utils/token";
import { env } from "../src/config/env.config";

const remote = vi.hoisted(() => ({
  failure: null as unknown,
  repositories: [] as any[],
  calls: 0,
}));

vi.mock("../src/services/github-client.service", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/services/github-client.service")
    >();

  return {
    ...actual,
    createGithubClient: async () => ({
      request: async () => {
        remote.calls++;

        if (remote.failure) throw remote.failure;

        return {
          data: { id: 42, login: "ana" },
          headers: { "x-oauth-scopes": "repo" },
        };
      },
      paginate: {
        iterator: () =>
          (async function* () {
            yield { data: remote.repositories.slice(0, 2) };
            yield { data: remote.repositories.slice(2) };
          })(),
      },
    }),
  };
});

const userId = randomUUID();
const otherId = randomUUID();
const handle = `repo-test-${userId.slice(0, 8)}`;
const root = "/api/v1/integrations/github/repositories";

let auth: string;
let cleanupAllowed = false;

const rawRepo = (id: number, overrides = {}) => ({
  id,
  name: `repo-${id}`,
  description: id === 1 ? null : "Descripción",
  language: null,
  stargazers_count: id,
  html_url: `https://github.com/ana/repo-${id}`,
  private: false,
  owner: { id: 42 },
  ...overrides,
});

const put = (ids: unknown[]) =>
  request(app)
    .put(`${root}/selected`)
    .set("Authorization", auth)
    .send({ repositoryIds: ids });

const saved = async () =>
  (
    await pool.query(
      `SELECT *
       FROM public.repository
       WHERE user_id = $1
       ORDER BY display_order`,
      [userId],
    )
  ).rows;

describe("T-43/44/45 HTTP + PostgreSQL local, proveedor simulado", () => {
  beforeAll(async () => {
    const target = new URL(process.env.LOCAL_DB_URL ?? "");

    if (
      process.env.NODE_ENV !== "test" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
      !["5432", "5433"].includes(target.port || "5432") ||
      target.pathname !== "/orbitia_repository_test"
    ) {
      throw new Error(
        "Usar npm run test:repositories:local. Solo base aislada local.",
      );
    }

    cleanupAllowed = true;

    await pool.query(
      `INSERT INTO public."user" (
         id, handle_name, name, first_surname, email
       )
       VALUES
         ($1, $2, 'Ana', 'Perez', $3),
         ($4, $5, 'Otra', 'Persona', $6)`,
      [
        userId,
        handle,
        `${handle}@example.test`,
        otherId,
        `${handle}-other`,
        `${handle}-other@example.test`,
      ],
    );

    await pool.query(
      `INSERT INTO public.external_account (
         user_id, provider, provider_user_id,
         provider_username, access_token, scopes
       )
       VALUES ($1, 'github', '42', 'ana', $2, 'repo')`,
      [userId, encryptToken("test-token")],
    );

    await pool.query(
      `INSERT INTO public.workexperience (
         user_id, title, company_name, description, start_date, visible
       )
       VALUES (
         $1, 'Frontend', 'Nexo', 'Interfaces', '2024-03-01', true
       )`,
      [userId],
    );

    await pool.query(
      `INSERT INTO public.link (user_id, text, url, visible)
       VALUES ($1, 'Portafolio', 'https://example.test', true)`,
      [userId],
    );

    auth = `Bearer ${createSession(userId, handle).token}`;

    await pool.query(
      `UPDATE public."user"
       SET public_link_active = true
       WHERE id = $1`,
      [userId],
    );
  });

  beforeEach(async () => {
    remote.failure = null;
    remote.calls = 0;
    remote.repositories = [1, 2, 3, 4, 5, 6].map((id) => rawRepo(id));

    await pool.query(
      `DELETE FROM public.field_visibility
       WHERE user_id = ANY($1::uuid[])`,
      [[userId, otherId]],
    );

    await pool.query(
      `DELETE FROM public.repository
       WHERE user_id = ANY($1::uuid[])`,
      [[userId, otherId]],
    );

    await pool.query(
      `UPDATE public.external_account
       SET state = 'active'
       WHERE user_id = $1`,
      [userId],
    );
  });

  afterAll(async () => {
    try {
      if (cleanupAllowed) {
        await pool.query(
          `DELETE FROM public."user"
           WHERE id = ANY($1::uuid[])`,
          [[userId, otherId]],
        );
      }
    } finally {
      await pool.end();
    }
  });

  it("protege sesión, usuario activo, origen y tipo JSON", async () => {
    expect((await request(app).get(root)).status).toBe(401);

    expect(
      (
        await request(app)
          .put(`${root}/selected`)
          .set("Authorization", auth)
          .set("Origin", "https://evil.test")
          .send({ repositoryIds: [] })
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .put(`${root}/selected`)
          .set("Authorization", auth)
          .type("form")
          .send("repositoryIds=1")
      ).status,
    ).toBe(415);

    const token = createSession(userId, handle).token;

    const signature = createHmac("sha256", env.COOKIE_SECRET)
      .update(token)
      .digest("base64")
      .replace(/=+$/, "");

    const signed = `s:${token}.${signature}`;

    expect(
      (
        await request(app)
          .get(root)
          .set("Cookie", `session=${encodeURIComponent(signed)}`)
      ).status,
    ).toBe(200);

    const logout = await request(app)
      .post("/api/v1/auth/logout")
      .send({});

    expect(logout.status).toBe(204);
    expect(logout.headers["set-cookie"][0]).toContain("session=");
    expect(logout.headers["set-cookie"][0]).toContain(
      "Expires=Thu, 01 Jan 1970",
    );
  });

  it("lista todas las páginas, seleccionados y nulos sin exponer tokens", async () => {
    await put([2, 1]);

    const response = await request(app)
      .get(root)
      .set("Authorization", auth);

    expect(response.status).toBe(200);
    expect(response.body.data.repositories).toHaveLength(6);
    expect(response.body.data.selectedIds).toEqual([2, 1]);

    expect(response.body.data.repositories[0]).toMatchObject({
      description: null,
      selected: true,
      visible: false,
    });

    expect(JSON.stringify(response.body)).not.toContain("test-token");
  });

  it("rechaza ajenos, privados, duplicados y máximo excedido conservando selección", async () => {
    await put([1]);

    remote.repositories.push(rawRepo(7, { private: true }));

    for (const ids of [[999], [7], [1, 1], [1, 2, 3, 4, 5, 6]]) {
      expect((await put(ids)).status).toBe(422);
    }

    expect(
      (await saved()).map((repo) => Number(repo.github_repo_id)),
    ).toEqual([1]);
  });

  it("reordena en transacción, conserva visibilidad y oculta nuevos", async () => {
    await put([1, 2]);

    await pool.query(
      `UPDATE public.repository
       SET visible = true
       WHERE user_id = $1 AND github_repo_id = 1`,
      [userId],
    );

    expect((await put([2, 3, 1])).status).toBe(200);

    const rows = await saved();

    expect(rows.map((repo) => Number(repo.github_repo_id))).toEqual([
      2, 3, 1,
    ]);

    expect(rows.map((repo) => repo.visible)).toEqual([
      false, false, true,
    ]);

    expect((await put([])).status).toBe(200);
    expect(await saved()).toEqual([]);
  });

  it("revierte toda la selección si falla guardar una copia", async () => {
    await put([1]);

    remote.repositories[1].html_url = "https://not-github.test/repo";

    expect((await put([2, 3])).status).toBe(500);

    expect(
      (await saved()).map((repo) => Number(repo.github_repo_id)),
    ).toEqual([1]);
  });

  it("retira y avisa al detectar un proyecto privado o eliminado", async () => {
    await put([1, 2, 3]);

    await pool.query(
      `UPDATE public.repository
       SET visible = true
       WHERE user_id = $1`,
      [userId],
    );

    remote.repositories = remote.repositories
      .filter((repo) => repo.id !== 2)
      .map((repo) => (repo.id === 1 ? { ...repo, private: true } : repo));

    const response = await request(app)
      .get(root)
      .set("Authorization", auth);

    expect(response.body.data.selectedIds).toEqual([3]);
    expect(response.body.data.warnings).toHaveLength(1);

    expect(
      (await saved()).map((repo) => Number(repo.github_repo_id)),
    ).toEqual([3]);
  });

  it("publica solo filas del titular visibles en orden usando SQL local", async () => {
    await put([3, 1, 2]);

    const rows = await saved();

    const visibility = await request(app)
      .patch("/api/v1/profile/visibility")
      .set("Authorization", auth)
      .send({
        changes: [
          { type: "repositories", visible: true },
          ...rows
            .filter((repo) => Number(repo.github_repo_id) !== 1)
            .map((repo) => ({
              type: "repository",
              id: repo.id,
              visible: true,
            })),
        ],
      });

    expect(visibility.status).toBe(200);

    const calls = remote.calls;

    await pool.query(
      `UPDATE public."user"
       SET public_link_active = false
       WHERE id = $1`,
      [userId],
    );

    expect(
      (await request(app).get(`/api/v1/public/profiles/${handle}`)).status,
    ).toBe(404);

    expect(
      (
        await request(app)
          .patch("/api/v1/profile/public-link")
          .set("Authorization", auth)
          .send({ publicLinkActive: true })
      ).status,
    ).toBe(200);

    const response = await request(app).get(
      `/api/v1/public/profiles/${handle}`,
    );

    expect(response.status).toBe(200);

    expect(
      response.body.data.repositories.map((repo: any) => repo.name),
    ).toEqual(["repo-3", "repo-2"]);

    expect(response.body.data.workExperiences[0]).toMatchObject({
      title: "Frontend",
      companyName: "Nexo",
    });

    expect(response.body.data.links[0].text).toBe("Portafolio");
    expect(response.body.data.email).toBeUndefined();
    expect(remote.calls).toBe(calls);

    await pool.query(
      `UPDATE public.external_account
       SET provider_username = 'different-account'
       WHERE user_id = $1`,
      [userId],
    );

    expect(
      (await request(app).get(`/api/v1/public/profiles/${handle}`))
        .body.data.repositories,
    ).toEqual([]);

    await pool.query(
      `UPDATE public.external_account
       SET provider_username = 'ana'
       WHERE user_id = $1`,
      [userId],
    );

    const stranger =
      `Bearer ${createSession(otherId, `${handle}-other`).token}`;

    expect(
      (
        await request(app)
          .patch("/api/v1/profile/visibility")
          .set("Authorization", stranger)
          .send({
            changes: [
              {
                type: "repository",
                id: rows[0].id,
                visible: true,
              },
            ],
          })
      ).status,
    ).toBe(409);

    await pool.query(
      `UPDATE public.external_account
       SET state = 'revoked'
       WHERE user_id = $1`,
      [userId],
    );

    expect(
      (await request(app).get(`/api/v1/public/profiles/${handle}`))
        .body.data.repositories,
    ).toEqual([]);
  });

  it("cuota y caída externa no borran selección y token rechazado requiere reconectar", async () => {
    await put([1]);

    remote.failure = {
      status: 403,
      response: { headers: { "retry-after": "20" } },
    };

    const limited = await request(app)
      .get(root)
      .set("Authorization", auth);

    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBe("20");
    expect(await saved()).toHaveLength(1);

    remote.failure = { status: 401 };

    expect(
      (await request(app).get(root).set("Authorization", auth))
        .body.code,
    ).toBe("GITHUB_REAUTH_REQUIRED");

    expect(
      (
        await pool.query(
          `SELECT state
           FROM public.external_account
           WHERE user_id = $1`,
          [userId],
        )
      ).rows[0].state,
    ).toBe("expired");
  });

  it("verifica RLS sin políticas, unicidad y eliminación en cascada", async () => {
    await put([1]);

    const rls = await pool.query(`
      SELECT
        relrowsecurity,
        (
          SELECT COUNT(*)::int
          FROM pg_policy
          WHERE polrelid = c.oid
        ) AS policies
      FROM pg_class c
      WHERE oid = 'public.repository'::regclass
    `);

    expect(rls.rows[0]).toEqual({
      relrowsecurity: true,
      policies: 0,
    });

    await expect(
      pool.query(
        `INSERT INTO public.repository (
           user_id, github_repo_id, name, url, display_order
         )
         VALUES ($1, 1, 'dup', 'https://github.com/a/b', 1)`,
        [userId],
      ),
    ).rejects.toMatchObject({ code: "23505" });

    const id = randomUUID();

    await pool.query(
      `INSERT INTO public."user" (
         id, handle_name, name, first_surname, email
       )
       VALUES ($1, $2, 'A', 'B', $3)`,
      [
        id,
        `cascade-${id.slice(0, 8)}`,
        `${id}@example.test`,
      ],
    );

    await pool.query(
      `INSERT INTO public.repository (
         user_id, github_repo_id, name, url, display_order
       )
       VALUES ($1, 1, 'cascade', 'https://github.com/a/b', 0)`,
      [id],
    );

    await pool.query(
      'DELETE FROM public."user" WHERE id = $1',
      [id],
    );

    expect(
      (
        await pool.query(
          "SELECT 1 FROM public.repository WHERE user_id = $1",
          [id],
        )
      ).rowCount,
    ).toBe(0);
  });
});