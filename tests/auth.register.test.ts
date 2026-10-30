import request from "supertest";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { app } from "../src/config/server.config";
import pool from "../src/config/database.config";
import { createSession } from "../src/services/session.service";

const registerRoute = "/api/v1/auth/register";

const validRegistration = {
  handleName: "Test-Register",
  name: "  juan  carlos ",
  firstSurname: "perez"
};

async function deleteTestUsers() {
  await pool.query(`DELETE FROM "user" WHERE handle_name LIKE 'test-%'`);
}

async function createOAuthUser(handleName: string, email: string) {
  const { rows } = await pool.query(
    `INSERT INTO "user" (handle_name, name, first_surname, email)
     VALUES ($1, 'Usuario', 'Pendiente', $2)
     RETURNING id`,
    [handleName, email]
  );
  return `Bearer ${createSession(rows[0].id, handleName).token}`;
}

describe("/api/v1/auth/register", () => {
  let authorization = "";

  beforeEach(async () => {
    await deleteTestUsers();
    authorization = await createOAuthUser("test-oauth-user", "test.register@mail.com");
  });

  afterAll(async () => {
    await deleteTestUsers();
    await pool.end();
  });

  it("returns the pending registration of the logged in user", async () => {
    const response = await request(app).get(registerRoute).set("Authorization", authorization);
    expect(response.status).toBe(200);
    expect(response.body.data.user.registrationCompleted).toBe(false);
    expect(response.body.data.user.email).toBe("test.register@mail.com");
  });

  it("completes the registration with the user data", async () => {
    const response = await request(app).patch(registerRoute).set("Authorization", authorization).send(validRegistration);
    expect(response.status).toBe(200);
    expect(response.body.data.user.handleName).toBe("test-register");
    expect(response.body.data.user.name).toBe("Juan Carlos");
    expect(response.body.data.user.firstSurname).toBe("Perez");
    expect(response.body.data.user.email).toBe("test.register@mail.com");
    expect(response.body.data.user.registrationCompleted).toBe(true);
  });

  it("keeps the current handle name when the user confirms it", async () => {
    const response = await request(app)
      .patch(registerRoute)
      .set("Authorization", authorization)
      .send({ ...validRegistration, handleName: "test-oauth-user" });
    expect(response.status).toBe(200);
    expect(response.body.data.user.handleName).toBe("test-oauth-user");
  });

  it("returns 409 when the registration was already completed", async () => {
    await request(app).patch(registerRoute).set("Authorization", authorization).send(validRegistration);
    const response = await request(app).patch(registerRoute).set("Authorization", authorization).send(validRegistration);
    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
  });

  it("returns 409 when the handle name belongs to another user", async () => {
    await createOAuthUser("test-taken", "test.taken@mail.com");
    const response = await request(app)
      .patch(registerRoute)
      .set("Authorization", authorization)
      .send({ ...validRegistration, handleName: "TEST-TAKEN" });
    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
  });

  it("returns 400 when the data is invalid", async () => {
    const invalidRegistrations = [
      { ...validRegistration, handleName: "a b" },
      { ...validRegistration, name: 123 },
      { ...validRegistration, firstSurname: "" },
      {}
    ];

    for (const invalidRegistration of invalidRegistrations) {
      const response = await request(app).patch(registerRoute).set("Authorization", authorization).send(invalidRegistration);
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    }
  });

  it("returns 401 without a session", async () => {
    const statusResponse = await request(app).get(registerRoute);
    const completeResponse = await request(app).patch(registerRoute).send(validRegistration);
    expect(statusResponse.status).toBe(401);
    expect(completeResponse.status).toBe(401);
  });
});
