import request from "supertest";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { app } from "../src/config/server.config";
import pool from "../src/config/database.config";
import * as SessionService from "../src/services/session.service";

const registerRoute = "/api/v1/auth/register";

const validUser = {
  handleName: "Test-Register",
  name: "  juan  carlos ",
  firstSurname: "perez"
};

function createRegistrationAuthorization(email: string) {
  const registration = SessionService.createRegistrationToken({ email: email, provider: "google" });
  return `Bearer ${registration.token}`;
}

async function deleteTestUsers() {
  await pool.query(`DELETE FROM "user" WHERE handle_name LIKE 'test-%'`);
}

describe("POST /api/v1/auth/register", () => {
  const authorization = createRegistrationAuthorization("test.register@mail.com");

  beforeEach(async () => {
    await deleteTestUsers();
  });

  afterAll(async () => {
    await deleteTestUsers();
    await pool.end();
  });

  it("registers a new user with the provider email and returns a session", async () => {
    const response = await request(app).post(registerRoute).set("Authorization", authorization).send(validUser);
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.handleName).toBe("test-register");
    expect(response.body.data.user.name).toBe("Juan Carlos");
    expect(response.body.data.user.email).toBe("test.register@mail.com");
    expect(response.body.data.session.token).toEqual(expect.any(String));
  });

  it("ignores an email sent in the body", async () => {
    const response = await request(app)
      .post(registerRoute)
      .set("Authorization", authorization)
      .send({ ...validUser, email: "someone.else@mail.com" });
    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe("test.register@mail.com");
  });

  it("returns 401 without a valid registration token", async () => {
    const withoutToken = await request(app).post(registerRoute).send(validUser);
    const invalidToken = await request(app).post(registerRoute).set("Authorization", "Bearer invalid-token").send(validUser);
    const session = SessionService.createSession("00000000-0000-0000-0000-000000000000", "test-session");
    const sessionToken = await request(app).post(registerRoute).set("Authorization", `Bearer ${session.token}`).send(validUser);
    expect(withoutToken.status).toBe(401);
    expect(invalidToken.status).toBe(401);
    expect(sessionToken.status).toBe(401);
  });

  it("returns 409 when the email is already registered", async () => {
    await request(app).post(registerRoute).set("Authorization", authorization).send(validUser);
    const response = await request(app)
      .post(registerRoute)
      .set("Authorization", authorization)
      .send({ ...validUser, handleName: "test-other-handle" });
    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
  });

  it("returns 409 when the handle name is already registered", async () => {
    await request(app).post(registerRoute).set("Authorization", authorization).send(validUser);
    const response = await request(app)
      .post(registerRoute)
      .set("Authorization", createRegistrationAuthorization("other.email@mail.com"))
      .send({ ...validUser, handleName: "TEST-REGISTER" });
    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
  });

  it("returns 400 when the data is invalid", async () => {
    const invalidUsers = [
      { ...validUser, handleName: "a b" },
      { ...validUser, name: 123 },
      { ...validUser, firstSurname: "" },
      {}
    ];

    for (const invalidUser of invalidUsers) {
      const response = await request(app).post(registerRoute).set("Authorization", authorization).send(invalidUser);
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    }
  });
});
