import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/config/server.config";
import pool from "../src/config/database.config";
import { env } from "../src/config/env.config";
import * as DeletionRepo from "../src/repositories/account-deletion.repository";
import * as ProfileRepo from "../src/repositories/profile.repository";
import { createSession } from "../src/services/session.service";
import { encryptToken } from "../src/utils/token";

const route = "/api/v1/profile";
const ids: string[] = [];
const previousKey = env.ENCRYPTION_KEY;
let userId: string;
let otherId: string;
let authorization: string;
let secondAuthorization: string;
let createdExternalTable = false;

async function cleanup() {
  await pool.query(`DELETE FROM public."user" WHERE id = ANY($1::uuid[])`, [ids]);
  ids.length = 0;
  await pool.query(`DELETE FROM public.phone p WHERE p.number IN ('79992001', '79992002')
    AND NOT EXISTS (SELECT 1 FROM public.user_phone up WHERE up.phone_id = p.id)`);
  await pool.query(`DELETE FROM public.email e WHERE e.address IN ('delete-only@example.com', 'delete-shared@example.com')
    AND NOT EXISTS (SELECT 1 FROM public.user_email ue WHERE ue.email_id = e.id)`);
}

beforeAll(async () => {
  const url = new URL(process.env.LOCAL_DB_URL!);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Estas pruebas requieren una base PostgreSQL local");
  }
  env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const { rows } = await pool.query(`SELECT to_regclass('public.external_account') AS name`);
  if (!rows[0].name) {
    // Temporary test fixture for the T-29 contract, not a T-24 migration.
    await pool.query(`CREATE TABLE public.external_account (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
      provider text NOT NULL, access_token text NOT NULL, refresh_token text
    )`);
    createdExternalTable = true;
  }
  await pool.query(`CREATE TABLE public.test_delete_section (
    user_id uuid REFERENCES public."user"(id) ON DELETE CASCADE,
    personal_data text
  )`);
});

beforeEach(async () => {
  await cleanup();
  const { rows } = await pool.query(`INSERT INTO public."user"
    (handle_name, name, first_surname, email, password_hash, profile_picture, public_link_active)
    VALUES ('test-delete-owner', 'Ana', 'Perez', 'delete-owner@example.com', 'private-hash', 'https://example.com/private.png', true),
           ('test-delete-other', 'Otra', 'Persona', 'delete-other@example.com', NULL, NULL, false) RETURNING id`);
  userId = rows[0].id;
  otherId = rows[1].id;
  ids.push(userId, otherId);
  authorization = `Bearer ${createSession(userId, "test-delete-owner").token}`;
  secondAuthorization = `Bearer ${createSession(userId, "test-delete-owner").token}`;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await cleanup();
  await pool.query(`DROP TABLE public.test_delete_section`);
  if (createdExternalTable) await pool.query(`DROP TABLE public.external_account`);
  env.ENCRYPTION_KEY = previousKey;
  await pool.end();
});

async function fillProfile() {
  await pool.query(`INSERT INTO public.user_surname (user_id, surname) VALUES ($1, 'Lopez')`, [userId]);
  await pool.query(`INSERT INTO public.phone (number) VALUES ('79992001'), ('79992002') ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO public.user_phone (user_id, phone_id, country_id)
    SELECT $1, p.id, c.id FROM public.phone p CROSS JOIN public.country c
    WHERE p.number IN ('79992001', '79992002') AND c.code = '591'`, [userId]);
  await pool.query(`INSERT INTO public.user_phone (user_id, phone_id, country_id)
    SELECT $1, p.id, c.id FROM public.phone p CROSS JOIN public.country c
    WHERE p.number = '79992002' AND c.code = '591'`, [otherId]);
  await pool.query(`INSERT INTO public.email (address) VALUES ('delete-only@example.com'), ('delete-shared@example.com') ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO public.user_email (user_id, email_id)
    SELECT $1, id FROM public.email WHERE address IN ('delete-only@example.com', 'delete-shared@example.com')`, [userId]);
  await pool.query(`INSERT INTO public.user_email (user_id, email_id)
    SELECT $1, id FROM public.email WHERE address = 'delete-shared@example.com'`, [otherId]);
  await pool.query(`INSERT INTO public.address (user_id, address) VALUES ($1, 'Direccion privada')`, [userId]);
  await pool.query(`INSERT INTO public.user_country (user_id, country_id) SELECT $1, id FROM public.country WHERE code = '591'`, [userId]);
  await pool.query(`INSERT INTO public.workexperience (user_id, title, start_date) VALUES ($1, 'Trabajo', '2024-01-01')`, [userId]);
  await pool.query(`INSERT INTO public.link (user_id, text, url) VALUES ($1, 'Personal', 'https://example.com')`, [userId]);
  await pool.query(`INSERT INTO public.external_account (user_id, provider, access_token, refresh_token)
    VALUES ($1, 'google', $2, $3), ($1, 'github', $4, NULL)`,
  [userId, encryptToken("google-secret"), encryptToken("refresh-secret"), encryptToken("github-secret")]);
  await pool.query(`INSERT INTO public.test_delete_section (user_id, personal_data) VALUES ($1, 'Cache privada')`, [userId]);
}

describe("DELETE /api/v1/profile", () => {
  it("requires a valid session", async () => {
    for (const token of ["", "Bearer invalid-token"]) {
      const response = await request(app).delete(route).set("Authorization", token).send({ confirmation: "ELIMINAR" });
      expect(response.status).toBe(401);
    }
  });

  it.each([undefined, {}, { confirmation: 123 }, { confirmation: "" }, { confirmation: "eliminar" }, { confirmation: "wrong@example.com" }])(
    "rejects incorrect confirmation without changing the user or calling a provider: %j", async body => {
      const response = await request(app).delete(route).set("Authorization", authorization).send(body);
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      const { rows } = await pool.query(`SELECT deleted_at, email FROM public."user" WHERE id = $1`, [userId]);
      expect(rows[0]).toEqual({ deleted_at: null, email: "delete-owner@example.com" });
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it("anonymizes the user, removes all dependent personal data, and preserves shared contacts", async () => {
    await fillProfile();
    const fetchMock = vi.fn().mockImplementation(async () => {
      const { rows } = await pool.query(`SELECT count(*)::int AS total FROM public.external_account WHERE user_id = $1`, [userId]);
      expect(rows[0].total).toBe(2);
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await request(app).delete(route).set("Authorization", authorization).send({ confirmation: "ELIMINAR", userId: otherId });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: "Cuenta eliminada correctamente" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const { rows } = await pool.query(`SELECT * FROM public."user" WHERE id = $1`, [userId]);
    expect(rows[0]).toMatchObject({ status: "deleted", public_link_active: false, name: null,
      first_surname: null, email: null, password_hash: null, profile_picture: null });
    expect(rows[0].handle_name).toMatch(/^deleted-[a-f0-9-]{36}$/);
    expect(rows[0].deleted_at).toBeInstanceOf(Date);
    for (const table of ["user_surname", "user_country", "user_phone", "user_email", "address", "link", "workexperience", "external_account", "test_delete_section"]) {
      const result = await pool.query(`SELECT count(*)::int AS total FROM public."${table}" WHERE user_id = $1`, [userId]);
      expect(result.rows[0].total, table).toBe(0);
    }
    expect((await pool.query(`SELECT number FROM public.phone WHERE number IN ('79992001', '79992002')`)).rows).toEqual([{ number: "79992002" }]);
    expect((await pool.query(`SELECT address FROM public.email WHERE address IN ('delete-only@example.com', 'delete-shared@example.com')`)).rows).toEqual([{ address: "delete-shared@example.com" }]);
    const other = await request(app).get(route).set("Authorization", `Bearer ${createSession(otherId, "test-delete-other").token}`);
    expect(other.status).toBe(200);
    expect(other.body.data.email).toBe("delete-other@example.com");
  });

  it.each(["DELETE-OWNER@EXAMPLE.COM", "DELETE-ONLY@EXAMPLE.COM"])("accepts the owner's email: %s", async confirmation => {
    await fillProfile();
    const response = await request(app).delete(route).set("Authorization", authorization).send({ confirmation });
    expect(response.status).toBe(200);
  });

  it("rejects every previous session on all profile routes and releases the original identity", async () => {
    // Different JWT payloads ensure these represent distinct sessions, not the same token.
    secondAuthorization = `Bearer ${createSession(userId, "previous-handle").token}`;
    expect(secondAuthorization).not.toBe(authorization);
    expect((await request(app).delete(route).set("Authorization", authorization).send({ confirmation: "ELIMINAR" })).status).toBe(200);
    for (const token of [authorization, secondAuthorization]) {
      const responses = await Promise.all([
        request(app).get(route).set("Authorization", token),
        request(app).post(route).set("Authorization", token).send({}),
        request(app).patch(route).set("Authorization", token).send({ name: "Otra" }),
        request(app).patch(`${route}/work-experience/123`).set("Authorization", token).send({ title: "Otra" }),
        request(app).delete(route).set("Authorization", token).send({ confirmation: "ELIMINAR" }),
      ]);
      expect(responses.map(response => response.status)).toEqual([401, 401, 401, 401, 401]);
    }
    expect((await pool.query(`SELECT id FROM public."user" WHERE handle_name = 'test-delete-owner' AND public_link_active = true AND deleted_at IS NULL`)).rows).toEqual([]);
    const registered = await request(app).post("/api/v1/auth/register").send({ handleName: "test-delete-owner", name: "Nueva", firstSurname: "Persona", email: "delete-owner@example.com", password: "Segura123" });
    expect(registered.status).toBe(201);
    ids.push(registered.body.data.user.id);
  });

  it("continues deletion when a provider is unavailable or already revoked", async () => {
    await fillProfile();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("provider-down secret"))
      .mockResolvedValueOnce(new Response(null, { status: 404 })));
    const response = await request(app).delete(route).set("Authorization", authorization).send({ confirmation: "ELIMINAR" });
    expect(response.status).toBe(200);
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect((await pool.query(`SELECT id FROM public.external_account WHERE user_id = $1`, [userId])).rows).toEqual([]);
    expect(JSON.stringify(response.body)).not.toMatch(/secret|token/);
  });

  it("prevents a concurrent profile write from recreating personal data after deletion", async () => {
    await pool.query(`INSERT INTO public.external_account (user_id, provider, access_token)
      VALUES ($1, 'google', $2)`, [userId, encryptToken("concurrent-secret")]);
    let releaseProvider!: () => void;
    let signalRevocation!: () => void;
    let signalWrite!: () => void;
    const providerGate = new Promise<void>(resolve => { releaseProvider = resolve; });
    const revocationStarted = new Promise<void>(resolve => { signalRevocation = resolve; });
    const writeStarted = new Promise<void>(resolve => { signalWrite = resolve; });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      signalRevocation();
      await providerGate;
      return new Response(null, { status: 200 });
    }));
    const original = ProfileRepo.lockActiveUser;
    vi.spyOn(ProfileRepo, "lockActiveUser").mockImplementation(async (id, client) => {
      signalWrite();
      return original(id, client);
    });
    const deletion = request(app).delete(route).set("Authorization", authorization)
      .send({ confirmation: "ELIMINAR" }).then(response => response);
    try {
      await revocationStarted;
      const write = request(app).post(route).set("Authorization", authorization)
        .send({ surname: { surname: "Nuevo", visibility: true } }).then(response => response);
      await writeStarted;
      releaseProvider();
      const [deleted, written] = await Promise.all([deletion, write]);
      expect(deleted.status).toBe(200);
      expect(written.status).toBe(401);
      expect((await pool.query(`SELECT user_id FROM public.user_surname WHERE user_id = $1`, [userId])).rows).toEqual([]);
    } finally {
      releaseProvider();
    }
  });

  it("rolls back all database changes if local deletion fails", async () => {
    await fillProfile();
    const original = DeletionRepo.deletePersonalData;
    vi.spyOn(DeletionRepo, "deletePersonalData").mockImplementationOnce(async (client, id) => {
      await original(client, id);
      throw new Error("private-database-secret");
    });
    const response = await request(app).delete(route).set("Authorization", authorization).send({ confirmation: "ELIMINAR" });
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, message: "No se pudo eliminar la cuenta" });
    const { rows } = await pool.query(`SELECT email, deleted_at, public_link_active FROM public."user" WHERE id = $1`, [userId]);
    expect(rows[0]).toEqual({ email: "delete-owner@example.com", deleted_at: null, public_link_active: true });
    expect((await pool.query(`SELECT id FROM public.external_account WHERE user_id = $1`, [userId])).rows).toHaveLength(2);
    expect((await request(app).get(route).set("Authorization", authorization)).status).toBe(200);
  });

  it("keeps all current user foreign keys cascading for a future purge", async () => {
    const { rows } = await pool.query(`SELECT conname FROM pg_constraint WHERE contype = 'f'
      AND confrelid = 'public."user"'::regclass AND confdeltype <> 'c'`);
    expect(rows).toEqual([]);
  });

  it("limits deletion to five requests per IP per fifteen minutes, including invalid sessions", async () => {
    const previousMode = env.NODE_ENV;
    env.NODE_ENV = "development";
    try {
      const statuses = [];
      for (let n = 0; n < 6; n++) {
        statuses.push((await request(app).delete(route).send({ confirmation: "ELIMINAR" })).status);
      }
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    } finally {
      env.NODE_ENV = previousMode;
    }
  });
});
