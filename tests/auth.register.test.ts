import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/config/server.config";

describe("Acceso exclusivamente mediante Google o GitHub", () => {
  it("does not expose password registration", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({
      name: "Ana", firstSurname: "Perez", handleName: "ana-test", email: "ana@example.test", password: "not-used",
    });
    expect(response.status).toBe(404);
    expect(response.body.data?.session).toBeUndefined();
  });
  it("does not expose password login", async () => {
    expect((await request(app).post("/api/v1/auth/login").send({ email: "ana@example.test", password: "not-used" })).status).toBe(404);
  });
});
