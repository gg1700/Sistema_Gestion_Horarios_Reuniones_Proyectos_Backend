import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { app } from "../src/config/server.config";
import pool, {
  getConectionString,
} from "../src/config/database.config";
import { createSession } from "../src/services/session.service";
import { encryptToken } from "../src/utils/token";

const route = "/api/v1/profile/visibility";
const userA = randomUUID();
const userB = randomUUID();
const repositoryId = randomUUID();
const userIds = [userA, userB];

let authA = "";
let authB = "";
let cleanupAllowed = false;

const patch = (changes: unknown, authorization = authA) =>
  request(app)
    .patch(route)
    .set("Authorization", authorization)
    .send({ changes });

const get = (authorization = authA) =>
  request(app)
    .get(route)
    .set("Authorization", authorization);

async function sectionRows(userId = userA) {
  const { rows } = await pool.query(
    `SELECT section, visible
     FROM public.field_visibility
     WHERE user_id = $1
     ORDER BY section`,
    [userId],
  );

  return rows;
}

async function individualFlags() {
  const repository = await pool.query(
    "SELECT visible FROM public.repository WHERE id = $1",
    [repositoryId],
  );

  const activity = await pool.query(
    `SELECT visible
     FROM public.github_activity_list
     WHERE user_id = $1`,
    [userA],
  );

  return {
    repository: repository.rows[0].visible,
    activity: activity.rows[0].visible,
  };
}

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

  cleanupAllowed = true;

  for (const id of userIds) {
    const handle = `test-general-${id.slice(0, 8)}`;

    await pool.query(
      `INSERT INTO public."user" (
         id, handle_name, name, first_surname, email, status
       )
       VALUES ($1, $2, 'Usuario', 'Prueba', $3, 'active')`,
      [id, handle, `${id}@example.test`],
    );
  }

  await pool.query(
    `INSERT INTO public.user_surname (user_id, surname, visible)
     VALUES ($1, 'Apellido', false)`,
    [userA],
  );

  await pool.query(
    `INSERT INTO public.repository (
       id, user_id, github_repo_id, name, url, display_order, visible
     )
     VALUES (
       $1, $2, 1001, 'prueba-general',
       'https://github.com/example/prueba-general', 0, false
     )`,
    [repositoryId, userA],
  );

  await pool.query(
    `INSERT INTO public.github_activity_list (
       user_id, activity, visible
     )
     VALUES ($1, '[]', false)`,
    [userA],
  );

  await pool.query(
  `UPDATE public."user"
   SET public_link_active = true
   WHERE id = $1`,
  [userA],
);

await pool.query(
  `INSERT INTO public.external_account (
     user_id, provider, provider_user_id,
     provider_username, access_token, state
   )
   VALUES ($1, 'github', $2, 'example', $3, 'active')`,
  [
    userA,
    `general-test-${userA}`,
    encryptToken("test-general-token"),
  ],
);

  authA = `Bearer ${createSession(
    userA,
    `test-general-${userA.slice(0, 8)}`,
  ).token}`;

  authB = `Bearer ${createSession(
    userB,
    `test-general-${userB.slice(0, 8)}`,
  ).token}`;
});

beforeEach(async () => {
  await pool.query(
    `DELETE FROM public.field_visibility
     WHERE user_id = ANY($1::uuid[])`,
    [userIds],
  );

  await pool.query(
    "UPDATE public.repository SET visible = false WHERE id = $1",
    [repositoryId],
  );

  await pool.query(
    `UPDATE public.github_activity_list
     SET visible = false
     WHERE user_id = $1`,
    [userA],
  );

  await pool.query(
    `UPDATE public.user_surname
     SET visible = false
     WHERE user_id = $1`,
    [userA],
  );
});

afterAll(async () => {
  try {
    if (cleanupAllowed) {
      await pool.query(
        `DELETE FROM public."user"
         WHERE id = ANY($1::uuid[])`,
        [userIds],
      );
    }
  } finally {
    await pool.end();
  }
});

describe("Permisos generales de visibilidad", () => {
  it("GET devuelve false por defecto sin crear configuración", async () => {
    const response = await get().expect(200);

    expect(response.body.data).toEqual(
      expect.arrayContaining([
        { type: "repositories", visible: false },
        { type: "githubActivity", visible: false },
      ]),
    );

    expect(await sectionRows()).toEqual([]);
  });

  it("PATCH guarda ambos permisos y GET confirma persistencia", async () => {
    await patch([
      { type: "repositories", visible: true },
      { type: "githubActivity", visible: true },
    ]).expect(200);

    const response = await get().expect(200);

    expect(response.body.data).toEqual(
      expect.arrayContaining([
        { type: "repositories", visible: true },
        { type: "githubActivity", visible: true },
      ]),
    );

    expect(await sectionRows()).toEqual([
      { section: "github_activity", visible: true },
      { section: "repositories", visible: true },
    ]);
  });

  it("actualiza una configuración existente sin duplicar filas", async () => {
    await patch([
      { type: "repositories", visible: true },
    ]).expect(200);

    await patch([
      { type: "repositories", visible: false },
    ]).expect(200);

    expect(await sectionRows()).toEqual([
      { section: "repositories", visible: false },
    ]);
  });

  it("apagar los permisos generales conserva los individuales", async () => {
    await pool.query(
      "UPDATE public.repository SET visible = true WHERE id = $1",
      [repositoryId],
    );

    await pool.query(
      `UPDATE public.github_activity_list
       SET visible = true
       WHERE user_id = $1`,
      [userA],
    );

    await patch([
      { type: "repositories", visible: true },
      { type: "githubActivity", visible: true },
    ]).expect(200);

    await patch([
      { type: "repositories", visible: false },
      { type: "githubActivity", visible: false },
    ]).expect(200);

    expect(await individualFlags()).toEqual({
      repository: true,
      activity: true,
    });

    expect(await sectionRows()).toEqual([
      { section: "github_activity", visible: false },
      { section: "repositories", visible: false },
    ]);
  });

  it("activar los permisos generales no activa los individuales", async () => {
    await patch([
      { type: "repositories", visible: true },
      { type: "githubActivity", visible: true },
    ]).expect(200);

    expect(await individualFlags()).toEqual({
      repository: false,
      activity: false,
    });
  });

  it("cada usuario consulta y modifica únicamente sus permisos", async () => {
    await patch([
      { type: "repositories", visible: true },
    ]).expect(200);

    await patch(
      [{ type: "githubActivity", visible: true }],
      authB,
    ).expect(200);

    const responseA = await get(authA).expect(200);
    const responseB = await get(authB).expect(200);

    expect(responseA.body.data).toEqual(
      expect.arrayContaining([
        { type: "repositories", visible: true },
        { type: "githubActivity", visible: false },
      ]),
    );

    expect(responseB.body.data).toEqual(
      expect.arrayContaining([
        { type: "repositories", visible: false },
        { type: "githubActivity", visible: true },
      ]),
    );
  });

  it("rechaza un identificador ajeno en un permiso general", async () => {
    await patch([
      {
        type: "repositories",
        id: userB,
        visible: true,
      },
    ]).expect(400);

    expect(await sectionRows(userA)).toEqual([]);
    expect(await sectionRows(userB)).toEqual([]);
  });

  it("revierte cambios generales e individuales si falla el lote", async () => {
    await patch([
      { type: "repositories", visible: true },
      { type: "surname", id: userA, visible: true },
      { type: "email", id: randomUUID(), visible: true },
    ]).expect(404);

    expect(await sectionRows()).toEqual([]);

    const surname = await pool.query(
      `SELECT visible
       FROM public.user_surname
       WHERE user_id = $1`,
      [userA],
    );

    expect(surname.rows[0].visible).toBe(false);
  });

  it("requiere sesión para guardar el permiso general", async () => {
    await request(app)
      .patch(route)
      .send({
        changes: [
          { type: "repositories", visible: true },
        ],
      })
      .expect(401);

    expect(await sectionRows()).toEqual([]);
  });

  it("rechaza valores que no sean booleanos", async () => {
    await patch([
      { type: "repositories", visible: "true" },
    ]).expect(400);

    expect(await sectionRows()).toEqual([]);
  });
  describe("Permisos de repositorios en el perfil público", () => {
  const publicRoute =
    `/api/v1/public/profiles/test-general-${userA.slice(0, 8)}`;

  it.each([
    { general: false, individual: false, expected: 0 },
    { general: false, individual: true, expected: 0 },
    { general: true, individual: false, expected: 0 },
    { general: true, individual: true, expected: 1 },
  ])(
    "general=$general e individual=$individual publica $expected",
    async ({ general, individual, expected }) => {
      await patch([
        { type: "repositories", visible: general },
        {
          type: "repository",
          id: repositoryId,
          visible: individual,
        },
      ]).expect(200);

      const response = await request(app)
        .get(publicRoute)
        .expect(200);

      expect(response.body.data.repositories).toHaveLength(expected);

      if (expected === 1) {
        expect(response.body.data.repositories[0]).toMatchObject({
          name: "prueba-general",
          url: "https://github.com/example/prueba-general",
        });
      }
    },
  );

  it("oculta el repositorio si todavía no existe permiso general", async () => {
    await patch([
      {
        type: "repository",
        id: repositoryId,
        visible: true,
      },
    ]).expect(200);

    const response = await request(app)
      .get(publicRoute)
      .expect(200);

    expect(response.body.data.repositories).toEqual([]);
    expect(await sectionRows()).toEqual([]);
    expect((await individualFlags()).repository).toBe(true);
  });

  it("apagar y reactivar el permiso general conserva la elección individual", async () => {
    await patch([
      { type: "repositories", visible: true },
      {
        type: "repository",
        id: repositoryId,
        visible: true,
      },
    ]).expect(200);

    const initial = await request(app)
      .get(publicRoute)
      .expect(200);

    expect(initial.body.data.repositories).toHaveLength(1);

    await patch([
      { type: "repositories", visible: false },
    ]).expect(200);

    const hidden = await request(app)
      .get(publicRoute)
      .expect(200);

    expect(hidden.body.data.repositories).toEqual([]);
    expect((await individualFlags()).repository).toBe(true);

    await patch([
      { type: "repositories", visible: true },
    ]).expect(200);

    const restored = await request(app)
      .get(publicRoute)
      .expect(200);

    expect(restored.body.data.repositories).toEqual(
      initial.body.data.repositories,
    );
  });
});
});