import request from "supertest";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { app } from "../src/config/server.config";
import pool from "../src/config/database.config";

const registerRoute = "/api/v1/auth/register";

const validUser = {
  handleName: "Test-Register",
  name: "  juan  carlos ",
  firstSurname: "perez",
  email: " Test.Register@Mail.com ",
  password: "Segura123"
};

async function deleteTestUsers() {
  await pool.query(`DELETE FROM "user" WHERE handle_name LIKE 'test-%'`);
}

describe("POST /api/v1/auth/register", () => {
  beforeEach(async () => {
    await deleteTestUsers();
  });

  afterAll(async () => {
    await deleteTestUsers();
    await pool.end();
  });

  it("registers a new user and returns a session", async () => {
    const response = await request(app).post(registerRoute).send(validUser);
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.handleName).toBe("test-register");
    expect(response.body.data.user.name).toBe("Juan Carlos");
    expect(response.body.data.user.email).toBe("test.register@mail.com");
    expect(response.body.data.session.token).toEqual(expect.any(String));
    expect(response.body.data.user.password).toBeUndefined();
  });
  
  it("returns 409 when the email is already registered", async () => {
    await request(app).post(registerRoute).send(validUser);
    const response = await request(app)
      .post(registerRoute)
      .send({ ...validUser, handleName: "test-other-handle" });
    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
  });

  it("returns 409 when the handle name is already registered", async () => {
    await request(app).post(registerRoute).send(validUser);
    const response = await request(app)
      .post(registerRoute)
      .send({ ...validUser, handleName: "TEST-REGISTER", email: "other.email@mail.com" });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
  });

  it("returns 400 when the data is invalid", async () => {
    const invalidUsers = [
      { ...validUser, email: "invalid-email" },
      { ...validUser, handleName: "a b" },
      { ...validUser, password: "short" },
      { ...validUser, name: 123 },
      {}
    ];

    for (const invalidUser of invalidUsers) {
      const response = await request(app).post(registerRoute).send(invalidUser);
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    }
  });
});
