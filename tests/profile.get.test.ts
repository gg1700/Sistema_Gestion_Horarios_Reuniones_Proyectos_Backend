import request from "supertest";
import jwt from "jsonwebtoken";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/config/server.config";
import pool from "../src/config/database.config";
import { env } from "../src/config/env.config";
import { createSession } from "../src/services/session.service";
import * as Query from "../src/utils/query";
import type { Profile } from "../src/types/profile-response.types";

const route = "/api/v1/profile";
let userId: string;
let otherUserId: string;
let authorization: string;

async function deleteTestUsers() {
  await pool.query(`DELETE FROM public."user" WHERE handle_name LIKE 'test-own-%'`);
}

async function fillProfile(id: string) {
  await pool.query(
    `INSERT INTO user_surname (user_id, surname, visible) VALUES ($1, 'Lopez', false)`,
    [id]
  );
  await pool.query(
    `INSERT INTO user_phone (user_id, phone_id, country_id, visible)
    SELECT $1, p.id, c.id, false FROM phone p CROSS JOIN country c
    WHERE p.number = '71234567' AND c.code = '591'`,
    [id]
  );
  await pool.query(
    `INSERT INTO user_email (user_id, email_id, visible)
    SELECT $1, id, false FROM email WHERE address = 'contact.own@example.com'`,
    [id]
  );
  await pool.query(
    `INSERT INTO address (user_id, address, visible) VALUES ($1, 'Calle de prueba', false)`,
    [id]
  );
  await pool.query(
    `INSERT INTO user_country (user_id, country_id, visible)
    SELECT $1, id, true FROM country WHERE code = '591'`,
    [id]
  );
  await pool.query(
    `INSERT INTO workexperience
    (user_id, title, description, company_name, start_date, end_date, visible)
    VALUES ($1, 'Anterior', 'Experiencia anterior', 'Empresa', '2020-01-15', '2021-01-31', true),
           ($1, 'Actual', NULL, NULL, '2024-02-01', NULL, false)`,
    [id]
  );
  await pool.query(
    `INSERT INTO link (user_id, text, url, visible)
    VALUES ($1, 'Privado', 'https://example.com/private', false),
           ($1, 'Publico', 'https://example.com/public', true)`,
    [id]
  );
  await pool.query(
    `UPDATE public."user" SET profile_picture = 'https://example.com/avatar.png' WHERE id = $1`,
    [id]
  );
}

describe("GET /api/v1/profile", () => {
  beforeEach(async () => {
    await deleteTestUsers();
    const { rows } = await pool.query(`INSERT INTO public."user"
      (handle_name, name, first_surname, email, password_hash)
      VALUES ('test-own-profile', 'Ana', 'Perez', 'own@example.com', 'private-password-hash'),
             ('test-own-other', 'Otra', 'Persona', 'other@example.com', 'other-password-hash')
      RETURNING id`);
    userId = rows[0].id;
    otherUserId = rows[1].id;
    authorization = `Bearer ${createSession(userId, "test-own-profile").token}`;
    await pool.query(`INSERT INTO phone (number) VALUES ('71234567') ON CONFLICT DO NOTHING`);
    await pool.query(
      `INSERT INTO email (address) VALUES ('contact.own@example.com') ON CONFLICT DO NOTHING`
    );
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await deleteTestUsers();
    await pool.end();
  });

  it("rejects a request without a session even if a userId is supplied", async () => {
    const response = await request(app).get(route).query({ userId: otherUserId });
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.data).toBeUndefined();
  });

  it.each(["Bearer invalid-token", "Basic invalid", "Bearer "])(
    "rejects invalid authorization: %s",
    async (header) => {
      const response = await request(app).get(route).set("Authorization", header);
      expect(response.status).toBe(401);
      expect(response.body.data).toBeUndefined();
    }
  );

  it("rejects an expired token", async () => {
    const token = jwt.sign({ userId, handlename: "test-own-profile" }, env.JWT_SECRET, {
      expiresIn: -1,
    });
    const response = await request(app).get(route).set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(401);
  });

  it("returns nulls and empty lists for an incomplete profile", async () => {
    const response = await request(app).get(route).set("Authorization", authorization);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toEqual({
      success: true,
      data: {
        id: userId,
        handleName: "test-own-profile",
        name: "Ana",
        firstSurname: "Perez",
        email: "own@example.com",
        profilePicture: null,
        surname: null,
        phones: [],
        contactEmails: [],
        addresses: [],
        countries: [],
        workExperiences: [],
        links: [],
      },
    });
  });

  it("rejects a soft-deleted user even with an unexpired token", async () => {
    await fillProfile(userId);
    await pool.query(`UPDATE public."user" SET deleted_at = now() WHERE id = $1`, [userId]);
    const response = await request(app).get(route).set("Authorization", authorization);
    expect(response.status).toBe(401);
    expect(response.body.data).toBeUndefined();
  });

  it("rejects a session whose user no longer exists", async () => {
    await pool.query(`DELETE FROM public."user" WHERE id = $1`, [userId]);
    const response = await request(app).get(route).set("Authorization", authorization);
    expect(response.status).toBe(401);
    expect(response.body.data).toBeUndefined();
  });

  it("rejects malformed signed user ids as an invalid session", async () => {
    const token = createSession("not-a-uuid", "test-own-profile").token;
    const response = await request(app).get(route).set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(401);
  });

  it("returns every section, including private values and visibility, without secrets", async () => {
    await fillProfile(userId);
    const response = await request(app).get(route).set("Authorization", authorization);
    expect(response.status).toBe(200);
    const profile = response.body.data as Profile;
    expect(profile.surname).toEqual({ surname: "Lopez", visible: false });
    expect(profile.profilePicture).toBe("https://example.com/avatar.png");
    expect(profile.phones).toEqual([
      {
        id: expect.any(String),
        phoneNumber: "71234567",
        countryCode: "591",
        countryName: "Bolivia",
        visible: false,
      },
    ]);
    expect(profile.contactEmails).toEqual([
      { id: expect.any(String), email: "contact.own@example.com", visible: false },
    ]);
    expect(profile.addresses).toEqual([
      { id: expect.any(String), address: "Calle de prueba", visible: false },
    ]);
    expect(profile.countries).toEqual([
      { id: expect.any(String), countryName: "Bolivia", countryCode: "591", visible: true },
    ]);
    expect(profile.workExperiences).toEqual([
      {
        id: expect.any(String),
        title: "Actual",
        description: null,
        companyName: null,
        startDate: "2024-02-01",
        endDate: null,
        visible: false,
      },
      {
        id: expect.any(String),
        title: "Anterior",
        description: "Experiencia anterior",
        companyName: "Empresa",
        startDate: "2020-01-15",
        endDate: "2021-01-31",
        visible: true,
      },
    ]);
    expect(profile.links).toHaveLength(2);
    expect(profile.links).toEqual(
      expect.arrayContaining([
        {
          id: expect.any(String),
          text: "Privado",
          url: "https://example.com/private",
          visible: false,
        },
        {
          id: expect.any(String),
          text: "Publico",
          url: "https://example.com/public",
          visible: true,
        },
      ])
    );
    expect(Object.keys(profile).sort()).toEqual(
      [
        "id",
        "handleName",
        "name",
        "firstSurname",
        "email",
        "profilePicture",
        "surname",
        "phones",
        "contactEmails",
        "addresses",
        "countries",
        "workExperiences",
        "links",
      ].sort()
    );
    expect(JSON.stringify(response.body)).not.toMatch(/password|token|secret|deleted_at|user_id/i);
  });

  it("uses only the session owner and does not mix another user's sections", async () => {
    await fillProfile(otherUserId);
    const response = await request(app)
      .get(route)
      .query({ userId: otherUserId, handle: "test-own-other" })
      .set("Authorization", authorization);
    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(userId);
    expect(response.body.data.surname).toBeNull();
    for (const section of [
      "phones",
      "contactEmails",
      "addresses",
      "countries",
      "workExperiences",
      "links",
    ]) {
      expect(response.body.data[section]).toEqual([]);
    }
    expect(JSON.stringify(response.body)).not.toContain("other@example.com");
  });

  it("keeps a constant number of queries when collections grow", async () => {
    await fillProfile(userId);
    const queries = vi.spyOn(Query, "processReturnQuery");
    const first = await request(app).get(route).set("Authorization", authorization);
    expect(first.status).toBe(200);
    const initialCount = queries.mock.calls.length;
    await pool.query(
      `INSERT INTO address (user_id, address, visible)
      SELECT $1, 'Direccion ' || n, false FROM generate_series(1, 20) n`,
      [userId]
    );
    queries.mockClear();
    const second = await request(app).get(route).set("Authorization", authorization);
    expect(second.status).toBe(200);
    expect(second.body.data.addresses).toHaveLength(21);
    expect(second.body.data.links).toHaveLength(2);
    expect(queries.mock.calls.length).toBe(initialCount);
    expect(initialCount).toBeLessThanOrEqual(2);
  });

  it("does not expose database errors when the session lookup fails", async () => {
    vi.spyOn(Query, "processReturnQuery").mockRejectedValueOnce(new Error("private-db-secret"));
    const response = await request(app).get(route).set("Authorization", authorization);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, message: "No se pudo verificar la sesion" });
  });

  it("does not expose database errors when loading the profile fails", async () => {
    vi.spyOn(Query, "processReturnQuery")
      .mockResolvedValueOnce([{ id: userId }])
      .mockRejectedValueOnce(new Error("private-db-secret"));
    const response = await request(app).get(route).set("Authorization", authorization);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, message: "No se pudo consultar el perfil" });
  });
});
