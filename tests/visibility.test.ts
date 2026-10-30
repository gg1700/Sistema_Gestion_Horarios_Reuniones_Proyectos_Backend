import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { randomUUID } from "node:crypto";
import { app } from "../src/config/server.config";
import pool, {
  getConectionString,
} from "../src/config/database.config";
import { createSession } from "../src/services/session.service";

const route = "/api/v1/profile/visibility";

const userA = randomUUID();
const userB = randomUUID();
const userIds = [userA, userB];
const repositoryId = randomUUID();

const handleA = `test-visibility-a-${userA.slice(0, 8)}`;
const handleB = `test-visibility-b-${userB.slice(0, 8)}`;

let authorization = "";
let cleanupAllowed = false;

async function createUser(id: string, handleName: string) {
  await pool.query(
    `INSERT INTO public."user" (
       id,
       handle_name,
       name,
       first_surname,
       email,
       profile_picture,
       status,
       created_at,
       updated_at
     )
     VALUES (
       $1, $2, 'Usuario', 'Prueba', $3, NULL,
       'active', NOW(), NOW()
     )`,
    [id, handleName, `${handleName}@example.test`],
  );
}

async function cleanup() {
  await pool.query(
    `DELETE FROM public."user"
     WHERE id = ANY($1::uuid[])`,
    [userIds],
  );
}

describe("GET y PATCH /api/v1/profile/visibility", () => {
  beforeAll(async () => {
    const target = new URL(getConectionString() ?? "");

    if (
      process.env.NODE_ENV !== "test" ||
      !["localhost", "127.0.0.1"].includes(target.hostname) ||
      target.pathname !== "/orbita_db"
    ) {
      throw new Error(
        "Estas pruebas requieren NODE_ENV=test y orbita_db en localhost",
      );
    }

    const database = await pool.query(
      "SELECT current_database() AS name",
    );

    if (database.rows[0].name !== "orbita_db") {
      throw new Error("La base conectada no es orbita_db");
    }

    const requiredTables = [
      "user",
      "user_surname",
      "user_email",
      "user_phone",
      "address",
      "user_country",
      "workexperience",
      "link",
      "repository",
      "github_activity_list",
      "github_activity_grid",
    ];

    const tables = await pool.query<{
      name: string;
      relation: string | null;
    }>(
      `SELECT
         name,
         to_regclass('public.' || quote_ident(name))::text AS relation
       FROM unnest($1::text[]) AS required(name)`,
      [requiredTables],
    );

    const missing = tables.rows
      .filter((table) => table.relation === null)
      .map((table) => table.name);

    if (missing.length > 0) {
      throw new Error(
        `Faltan tablas requeridas por T-15: ${missing.join(", ")}`,
      );
    }

    cleanupAllowed = true;

    await createUser(userA, handleA);
    await createUser(userB, handleB);

    await pool.query(
      `INSERT INTO public.user_surname
         (user_id, surname, visible)
       VALUES
         ($1, 'ApellidoUsuarioA', false),
         ($2, 'ApellidoUsuarioB', false)`,
      [userA, userB],
    );

    await pool.query(
      `INSERT INTO public.repository (
         id, user_id, github_repo_id, name, url, visible
       )
       VALUES (
         $1, $2, 1001, 'repositorio-prueba',
         'https://github.com/example/repositorio-prueba',
         false
       )`,
      [repositoryId, userA],
    );

    await pool.query(
      `INSERT INTO public.github_activity_list (user_id, visible)
       VALUES ($1, false)`,
      [userA],
    );

    authorization = `Bearer ${createSession(userA, handleA).token}`;
  });

  beforeEach(async () => {
    await pool.query(
      `UPDATE public.user_surname
       SET visible = false
       WHERE user_id = ANY($1::uuid[])`,
      [userIds],
    );

    await pool.query(
      `UPDATE public.repository
       SET visible = false
       WHERE id = $1 AND user_id = $2`,
      [repositoryId, userA],
    );

    await pool.query(
      `UPDATE public.github_activity_list
       SET visible = false
       WHERE user_id = $1`,
      [userA],
    );
  });

  afterAll(async () => {
    try {
      if (cleanupAllowed) {
        await cleanup();
      }
    } finally {
      await pool.end();
    }
  });

  it("GET sin sesión devuelve 401", async () => {
    await request(app)
      .get(route)
      .expect(401);
  });

  it("GET devuelve los registros configurados como ocultos", async () => {
    const response = await request(app)
      .get(route)
      .set("Authorization", authorization)
      .expect(200);

    expect(response.body.success).toBe(true);

    expect(response.body.data).toEqual(
      expect.arrayContaining([
        {
          type: "repository",
          id: repositoryId,
          visible: false,
          name: "repositorio-prueba",
        },
        {
          type: "githubActivityList",
          id: userA,
          visible: false,
        },
      ]),
    );
  });

  it("PATCH actualiza dos registros y GET confirma persistencia", async () => {
    const response = await request(app)
      .patch(route)
      .set("Authorization", authorization)
      .send({
        changes: [
          {
            type: "repository",
            id: repositoryId,
            visible: true,
          },
          {
            type: "githubActivityList",
            id: userA,
            visible: true,
          },
        ],
      })
      .expect(200);

    expect(response.body.success).toBe(true);

    const getResponse = await request(app)
      .get(route)
      .set("Authorization", authorization)
      .expect(200);

    expect(getResponse.body.data).toEqual(
      expect.arrayContaining([
        {
          type: "repository",
          id: repositoryId,
          visible: true,
          name: "repositorio-prueba",
        },
        {
          type: "githubActivityList",
          id: userA,
          visible: true,
        },
      ]),
    );
  });

  it("PATCH rechaza tipos no permitidos", async () => {
    await request(app)
      .patch(route)
      .set("Authorization", authorization)
      .send({
        changes: [
          {
            type: "password",
            visible: true,
          },
        ],
      })
      .expect(400);
  });

  it("PATCH rechaza una lista vacía", async () => {
    await request(app)
      .patch(route)
      .set("Authorization", authorization)
      .send({ changes: [] })
      .expect(400);
  });

  it("PATCH rechaza cambiar el apellido de otro usuario", async () => {
    await request(app)
      .patch(route)
      .set("Authorization", authorization)
      .send({
        changes: [
          {
            type: "surname",
            id: userB,
            visible: true,
          },
        ],
      })
      .expect(400);

    const result = await pool.query(
      `SELECT visible
       FROM public.user_surname
       WHERE user_id = $1`,
      [userB],
    );

    expect(result.rows[0].visible).toBe(false);
  });

  it("PATCH revierte el primer cambio si falla el segundo", async () => {
    await request(app)
      .patch(route)
      .set("Authorization", authorization)
      .send({
        changes: [
          {
            type: "surname",
            id: userA,
            visible: true,
          },
          {
            type: "email",
            id: randomUUID(),
            visible: true,
          },
        ],
      })
      .expect(404);

    const result = await pool.query(
      `SELECT visible
       FROM public.user_surname
       WHERE user_id = $1`,
      [userA],
    );

    expect(result.rows[0].visible).toBe(false);
  });

  it("PATCH sin sesión devuelve 401", async () => {
    await request(app)
      .patch(route)
      .send({
        changes: [
          {
            type: "surname",
            id: userA,
            visible: true,
          },
        ],
      })
      .expect(401);
  });

  it("PATCH guarda la visibilidad del apellido del usuario", async () => {
    const response = await request(app)
      .patch(route)
      .set("Authorization", authorization)
      .send({
        changes: [
          {
            type: "surname",
            id: userA,
            visible: true,
          },
        ],
      })
      .expect(200);

    expect(response.body.success).toBe(true);

    const result = await pool.query(
      `SELECT visible
       FROM public.user_surname
       WHERE user_id = $1`,
      [userA],
    );

    expect(result.rows[0].visible).toBe(true);

    const getResponse = await request(app)
      .get(route)
      .set("Authorization", authorization)
      .expect(200);

    expect(getResponse.body.data).toEqual(
      expect.arrayContaining([
        {
          type: "surname",
          id: userA,
          visible: true,
        },
      ]),
    );
  });
});