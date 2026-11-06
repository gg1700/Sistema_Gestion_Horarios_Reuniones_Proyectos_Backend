import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import pool, {
  getConectionString,
} from "../src/config/database.config";
import * as service from "../src/services/availabilityRules.service";

const userA = randomUUID();
const userB = randomUUID();
const userIds = [userA, userB];

let cleanupAllowed = false;

const monday = {
  dayOfWeek: 1,
  startTime: "09:00",
  endTime: "12:00",
  active: true,
};

const friday = {
  dayOfWeek: 5,
  startTime: "14:00",
  endTime: "17:00",
  active: true,
};

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

  const { rows } = await pool.query(
    "SELECT current_database() AS name",
  );

  if (rows[0].name !== "orbita_db") {
    throw new Error("La base conectada no es orbita_db");
  }

  cleanupAllowed = true;

  for (const id of userIds) {
    const handle = `test-s38-${id.slice(0, 8)}`;

    await pool.query(
      `INSERT INTO public."user" (
         id, handle_name, name, first_surname, email, status
       )
       VALUES ($1, $2, 'Usuario', 'Prueba', $3, 'active')`,
      [id, handle, `${id}@example.test`],
    );
  }
});

beforeEach(async () => {
  await pool.query(
    `DELETE FROM public.availability_rule
     WHERE user_id = ANY($1::uuid[])`,
    [userIds],
  );

  await pool.query(
    `DELETE FROM public.calendar_settings
     WHERE user_id = ANY($1::uuid[])`,
    [userIds],
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

describe("Disponibilidad con PostgreSQL", () => {
  it("sin configuración devuelve UTC y no crea settings", async () => {
    await expect(service.getAvailabilityRules(userA)).resolves.toEqual({
      timeZone: "UTC",
      rules: [],
    });

    const { rows } = await pool.query(
      `SELECT user_id
       FROM public.calendar_settings
       WHERE user_id = $1`,
      [userA],
    );

    expect(rows).toHaveLength(0);
  });

  it("guarda y consulta reglas ordenadas con horas HH:mm", async () => {
    const saved = await service.replaceAvailabilityRules(userA, {
      timeZone: "America/La_Paz",
      rules: [friday, monday],
    });

    expect(saved.timeZone).toBe("America/La_Paz");

    expect(
      saved.rules.map(({ dayOfWeek, startTime, endTime, active }) => ({
        dayOfWeek,
        startTime,
        endTime,
        active,
      })),
    ).toEqual([monday, friday]);

    await expect(service.getAvailabilityRules(userA)).resolves.toEqual(
      saved,
    );
  });

  it("repetir el mismo PUT conserva UUID y fechas de actualización", async () => {
    const input = {
      timeZone: "America/La_Paz",
      rules: [monday, friday],
    };

    const first = await service.replaceAvailabilityRules(userA, input);

    const before = await pool.query(
      `SELECT id, updated_at
       FROM public.availability_rule
       WHERE user_id = $1
       ORDER BY id`,
      [userA],
    );

    const settingsBefore = await pool.query(
      `SELECT updated_at
       FROM public.calendar_settings
       WHERE user_id = $1`,
      [userA],
    );

    const second = await service.replaceAvailabilityRules(userA, input);

    const after = await pool.query(
      `SELECT id, updated_at
       FROM public.availability_rule
       WHERE user_id = $1
       ORDER BY id`,
      [userA],
    );

    const settingsAfter = await pool.query(
      `SELECT updated_at
       FROM public.calendar_settings
       WHERE user_id = $1`,
      [userA],
    );

    expect(second).toEqual(first);
    expect(after.rows).toEqual(before.rows);
    expect(settingsAfter.rows).toEqual(settingsBefore.rows);
  });

  it("una lista vacía elimina las reglas y conserva la zona elegida", async () => {
    await service.replaceAvailabilityRules(userA, {
      timeZone: "America/La_Paz",
      rules: [monday],
    });

    await service.replaceAvailabilityRules(userA, {
      timeZone: "America/La_Paz",
      rules: [],
    });

    await expect(service.getAvailabilityRules(userA)).resolves.toEqual({
      timeZone: "America/La_Paz",
      rules: [],
    });

    const { rows } = await pool.query(
      `SELECT id
       FROM public.availability_rule
       WHERE user_id = $1`,
      [userA],
    );

    expect(rows).toHaveLength(0);
  });

  it("modificar un usuario no cambia la configuración del otro", async () => {
    const savedB = await service.replaceAvailabilityRules(userB, {
      timeZone: "America/Lima",
      rules: [friday],
    });

    await service.replaceAvailabilityRules(userA, {
      timeZone: "America/La_Paz",
      rules: [monday],
    });

    await service.replaceAvailabilityRules(userA, {
      timeZone: "UTC",
      rules: [],
    });

    await expect(service.getAvailabilityRules(userB)).resolves.toEqual(
      savedB,
    );
  });

  it("un fallo de inserción revierte la zona y las reglas anteriores", async () => {
    const original = await service.replaceAvailabilityRules(userA, {
      timeZone: "America/La_Paz",
      rules: [monday],
    });

    await expect(
      service.replaceAvailabilityRules(userA, {
        timeZone: "America/Lima",
        rules: [
          { ...monday, active: false },
          { ...friday, dayOfWeek: 7 },
        ],
      }),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(service.getAvailabilityRules(userA)).resolves.toEqual(
      original,
    );
  });
});