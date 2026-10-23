import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { app } from "../src/config/server.config";
import pool from "../src/config/database.config";
import { createSession } from "../src/services/session.service";

const route = "/api/v1/profile/visibility";

const userA = randomUUID();
const userB = randomUUID();

const handleA = `test-visibility-a-${userA.slice(0, 8)}`;
const handleB = `test-visibility-b-${userB.slice(0, 8)}`;

let authorization = "";

// Crear usuarios directamente en la base de pruebas
async function createUser(id: string, handleName: string) {
  await pool.query(
    `INSERT INTO public."user"
      (
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
        $1,
        $2,
        'Usuario',
        'Prueba',
        $3,
        $4,
        'active',
        CURRENT_DATE,
        CURRENT_DATE
     )`,
    [
      id,
      handleName,
      `${handleName}@example.com`,
      Buffer.alloc(0)
    ]
  );
}

// Eliminar los usuarios temporales
async function cleanup() {
  // Eliminar primero los registros relacionados con los usuarios
  await pool.query(
    `DELETE FROM public.field_visibility
     WHERE user_id = ANY($1::uuid[])`,
    [[userA, userB]]
  );

  await pool.query(
    `DELETE FROM public.user_surname
     WHERE user_id = ANY($1::uuid[])`,
    [[userA, userB]]
  );

  // Eliminar los usuarios
  await pool.query(
    `DELETE FROM public."user"
     WHERE id = ANY($1::uuid[])`,
    [[userA, userB]]
  );
}

describe("GET y PATCH /api/v1/profile/visibility", () => {

  beforeAll(async () => {

    // Verificar que utilizamos exclusivamente la base de pruebas
    const database = await pool.query(
      "SELECT current_database() AS name"
    );

    if (
      process.env.NODE_ENV !== "test" ||
      database.rows[0].name !== "orbita_t15_test"
    ) {
      throw new Error(
        "Estas pruebas solo pueden ejecutarse con NODE_ENV=test y orbita_t15_test"
      );
    }

    // Crear los dos usuarios temporales
    await createUser(userA, handleA);
    await createUser(userB, handleB);

    // Crear apellido para el usuario A
    await pool.query(
      `INSERT INTO public.user_surname
       (user_id, surname, visible)
       VALUES ($1, 'ApellidoUsuarioA', false)`,
      [userA]
    );

    // Crear apellido para el usuario B
    await pool.query(
      `INSERT INTO public.user_surname
       (user_id, surname, visible)
       VALUES ($1, 'ApellidoUsuarioB', false)`,
      [userB]
    );

    // Generar JWT para el usuario A
    authorization = `Bearer ${createSession(userA, handleA).token}`;
  });

  afterAll(async () => {

    // Verificar la base antes de eliminar los datos
    const database = await pool.query(
      "SELECT current_database() AS name"
    );

    if (
      process.env.NODE_ENV === "test" &&
      database.rows[0].name === "orbita_t15_test"
    ) {
      await cleanup();
    }

    await pool.end();
  });

  // PRUEBA 1: GET sin autenticación
  it("GET sin sesion devuelve 401", async () => {

    const response = await request(app)
      .get(route);

    expect(response.status).toBe(401);
  });

  // PRUEBA 2: GET con autenticación y valores predeterminados
  it("GET con sesion muestra GitHub oculto por defecto", async () => {

    const response = await request(app)
      .get(route)
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toEqual(
      expect.arrayContaining([
        {
          type: "repositories",
          visible: false
        },
        {
          type: "githubActivity",
          visible: false
        }
      ])
    );
  });

  // PRUEBA 3: PATCH con múltiples cambios
  it("PATCH actualiza dos secciones y GET confirma persistencia", async () => {

    const response = await request(app)
      .patch(route)
      .set("Authorization", authorization)
      .send({
        changes: [
          {
            type: "repositories",
            visible: true
          },
          {
            type: "githubActivity",
            visible: true
          }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // Comprobar que los cambios se guardaron
    const getResponse = await request(app)
      .get(route)
      .set("Authorization", authorization);

    expect(getResponse.status).toBe(200);

    expect(getResponse.body.data).toEqual(
      expect.arrayContaining([
        {
          type: "repositories",
          visible: true
        },
        {
          type: "githubActivity",
          visible: true
        }
      ])
    );
  });

  // PRUEBA 4: Tipo inválido
  it("PATCH rechaza tipos no permitidos", async () => {

    const response = await request(app)
      .patch(route)
      .set("Authorization", authorization)
      .send({
        changes: [
          {
            type: "password",
            visible: true
          }
        ]
      });

    expect(response.status).toBe(400);
  });

  // PRUEBA 5: Lista vacía
  it("PATCH rechaza una lista vacia", async () => {

    const response = await request(app)
      .patch(route)
      .set("Authorization", authorization)
      .send({
        changes: []
      });

    expect(response.status).toBe(400);
  });

  // PRUEBA 6: Intentar modificar el apellido de otro usuario
  it("PATCH rechaza cambiar el apellido de otro usuario", async () => {

    const response = await request(app)
      .patch(route)
      .set("Authorization", authorization)
      .send({
        changes: [
          {
            type: "surname",
            id: userB,
            visible: true
          }
        ]
      });

    expect(response.status).toBe(400);

    // Verificar que el apellido del usuario B no cambió
    const result = await pool.query(
      `SELECT visible
       FROM public.user_surname
       WHERE user_id = $1`,
      [userB]
    );

    expect(result.rows[0].visible).toBe(false);
  });

  // PRUEBA 7: Verificar rollback
  it("PATCH hace rollback si falla el segundo cambio", async () => {

    const response = await request(app)
      .patch(route)
      .set("Authorization", authorization)
      .send({
        changes: [
          {
            type: "repositories",
            visible: false
          },
          {
            type: "email",
            id: randomUUID(),
            visible: true
          }
        ]
      });

    // El segundo cambio debe fallar
    expect(response.status).toBe(404);

    // El primer cambio debe haberse revertido
    const result = await pool.query(
      `SELECT visible
       FROM public.field_visibility
       WHERE user_id = $1
       AND section = 'repositories'`,
      [userA]
    );

    expect(result.rows[0].visible).toBe(true);
  });

  // PRUEBA 8: PATCH sin autenticación
  it("PATCH sin sesion devuelve 401", async () => {

    const response = await request(app)
      .patch(route)
      .send({
        changes: [
          {
            type: "repositories",
            visible: false
          }
        ]
      });

    expect(response.status).toBe(401);
  });

  // PRUEBA 9: Actualizar la visibilidad de un campo real del perfil
  it("PATCH actualiza la visibilidad del apellido del usuario", async () => {

    // Verificar que inicialmente el apellido está oculto
    const initialResult = await pool.query(
      `SELECT visible
       FROM public.user_surname
       WHERE user_id = $1`,
      [userA]
    );

    expect(initialResult.rows[0].visible).toBe(false);

    // Actualizar la visibilidad mediante PATCH
    const response = await request(app)
      .patch(route)
      .set("Authorization", authorization)
      .send({
        changes: [
          {
            type: "surname",
            id: userA,
            visible: true
          }
        ]
      });

    // Verificar respuesta del endpoint
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // Consultar directamente PostgreSQL
    const result = await pool.query(
      `SELECT visible
       FROM public.user_surname
       WHERE user_id = $1`,
      [userA]
    );

    // Confirmar que se guardó el cambio
    expect(result.rows[0].visible).toBe(true);

    // Consultar nuevamente mediante GET
    const getResponse = await request(app)
      .get(route)
      .set("Authorization", authorization);

    expect(getResponse.status).toBe(200);

    // Confirmar que GET devuelve el apellido visible
    expect(getResponse.body.data).toEqual(
      expect.arrayContaining([
        {
          type: "surname",
          id: userA,
          visible: true
        }
      ])
    );
  });

});