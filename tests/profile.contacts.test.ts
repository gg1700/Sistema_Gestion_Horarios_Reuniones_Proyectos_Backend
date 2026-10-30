import request from "supertest";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { app } from "../src/config/server.config";
import pool from "../src/config/database.config";
import { createSession } from "../src/services/session.service";

const profileRoute = "/api/v1/profile";

async function deleteTestUsers() {
  await pool.query(`DELETE FROM "user" WHERE handle_name LIKE 'test-%'`);
}

async function createTestUser() {
  const { rows } = await pool.query(
    `INSERT INTO "user" (handle_name, name, first_surname, email)
     VALUES ('test-contacts', 'Ana', 'Perez', 'test.contacts@mail.com')
     RETURNING id`
  );
  return `Bearer ${createSession(rows[0].id, "test-contacts").token}`;
}

describe("POST /api/v1/profile contacts", () => {
  let authorization = "";

  beforeEach(async () => {
    await deleteTestUsers();
    authorization = await createTestUser();
  });

  afterAll(async () => {
    await deleteTestUsers();
    await pool.end();
  });

  it("accepts two phones from different countries and two contact emails", async () => {
    const response = await request(app).post(profileRoute).set("Authorization", authorization).send({
      phones: [
        { phoneNumber: "71234567", countryCode: "591" },
        { phoneNumber: "5512345678", countryCode: "+52" }
      ],
      contactEmails: [{ email: "uno@mail.com" }, { email: "dos@mail.com" }]
    });
    expect(response.status).toBe(201);

    const { rows } = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM "user_phone" p JOIN "user" u ON u.id = p.user_id WHERE u.handle_name = 'test-contacts') AS phones,
        (SELECT COUNT(*) FROM "user_email" e JOIN "user" u ON u.id = e.user_id WHERE u.handle_name = 'test-contacts') AS emails`
    );
    expect(Number(rows[0].phones)).toBe(2);
    expect(Number(rows[0].emails)).toBe(2);
  });

  it("returns 400 when there are more than two phones or contact emails", async () => {
    const tooManyPhones = await request(app).post(profileRoute).set("Authorization", authorization).send({
      phones: [
        { phoneNumber: "71234567", countryCode: "591" },
        { phoneNumber: "71234568", countryCode: "591" },
        { phoneNumber: "71234569", countryCode: "591" }
      ]
    });
    const tooManyEmails = await request(app).post(profileRoute).set("Authorization", authorization).send({
      contactEmails: [{ email: "uno@mail.com" }, { email: "dos@mail.com" }, { email: "tres@mail.com" }]
    });
    expect(tooManyPhones.status).toBe(400);
    expect(tooManyEmails.status).toBe(400);
  });

  it("returns 400 when the phone does not have the digits of its country", async () => {
    const invalidPhones = [
      { phoneNumber: "7123456", countryCode: "591" },
      { phoneNumber: "712345678", countryCode: "591" },
      { phoneNumber: "123456789", countryCode: "52" },
      { phoneNumber: "71234567", countryCode: "999" }
    ];

    for (const invalidPhone of invalidPhones) {
      const response = await request(app).post(profileRoute).set("Authorization", authorization).send({ phones: [invalidPhone] });
      expect(response.status).toBe(400);
    }
  });
});
