import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findSessionProfile: vi.fn(), findLinkedIdentities: vi.fn(), updateSessionProfile: vi.fn(), isActiveProfileUser: vi.fn(),
}));
vi.mock("../src/repositories/auth-session.repository", () => ({
  findSessionProfile: mocks.findSessionProfile, findLinkedIdentities: mocks.findLinkedIdentities, updateSessionProfile: mocks.updateSessionProfile,
  normalizeScopes: (value: string) => value.split(/[,\s]+/).filter(Boolean),
}));
vi.mock("../src/repositories/profile-read.repository", () => ({ isActiveProfileUser: mocks.isActiveProfileUser }));
import { app } from "../src/config/server.config";
import { createSession } from "../src/services/session.service";

const profile = { id: "11111111-1111-4111-8111-111111111111", handleName: "ana-perez", name: "Ana", firstSurname: "Perez", email: "ana@test.example", profilePicture: null, requiresProfileCompletion: false };
const authorization = () => "Bearer " + createSession(profile.id, profile.handleName).token;
beforeEach(() => {
  vi.resetAllMocks(); mocks.findSessionProfile.mockResolvedValue(profile);
  mocks.findLinkedIdentities.mockResolvedValue([{ provider: "github", username: "ana", email: null, state: "active", scopes: ["read:user"] }]);
  mocks.isActiveProfileUser.mockResolvedValue(true); mocks.updateSessionProfile.mockResolvedValue(true);
});
describe("OAuth session boundary", () => {
  it("does not accept a query userId as authentication", async () => {
    for (const path of ["/api/v1/auth/session", "/api/v1/auth/accounts", "/api/v1/integrations/github/connection"]) {
      expect((await request(app).get(path).query({ userId: profile.id })).status).toBe(401);
    }
    expect((await request(app).delete("/api/v1/auth/accounts/github").query({ userId: profile.id })).status).toBe(401);
    expect(mocks.findSessionProfile).not.toHaveBeenCalled();
  });
  it("returns the authenticated user and linked providers without tokens", async () => {
    const response = await request(app).get("/api/v1/auth/session").set("Authorization", authorization());
    expect(response.status).toBe(200);
    expect(response.body.data.profile.id).toBe(profile.id);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(response.body)).not.toMatch(/access_token|refresh_token|password_hash/);
  });
  it("rejects deleted users and legacy users without OAuth identities", async () => {
    mocks.isActiveProfileUser.mockResolvedValue(false);
    expect((await request(app).get("/api/v1/auth/session").set("Authorization", authorization())).status).toBe(401);
    mocks.isActiveProfileUser.mockResolvedValue(true); mocks.findLinkedIdentities.mockResolvedValue([]);
    expect((await request(app).get("/api/v1/auth/session").set("Authorization", authorization())).status).toBe(401);
  });
  it("does not accept password, email or another user's identity in completion", async () => {
    const response = await request(app).patch("/api/v1/auth/profile").set("Authorization", authorization())
      .send({ name: "Ana", firstSurname: "Perez", handleName: "ana-perez", email: "other@example.test", password: "bad" });
    expect(response.status).toBe(400);
    expect(mocks.updateSessionProfile).not.toHaveBeenCalled();
  });
  it("reports duplicate handles without disclosing database errors", async () => {
    mocks.updateSessionProfile.mockRejectedValue({ code: "23505", detail: "internal" });
    const response = await request(app).patch("/api/v1/auth/profile").set("Authorization", authorization())
      .send({ name: "Ana", firstSurname: "Perez", handleName: "ana-perez" });
    expect(response.status).toBe(409); expect(response.text).not.toContain("internal");
  });
  it("clears the cookie without requiring a provider revocation", async () => {
    const response = await request(app).post("/api/v1/auth/logout");
    expect(response.status).toBe(204);
    expect(response.headers["set-cookie"].join(";")).toContain("HttpOnly");
    expect(response.headers["set-cookie"].join(";")).toContain("Path=/");
  });
  it("rejects browser writes from an unrelated origin", async () => {
    expect((await request(app).post("/api/v1/auth/logout").set("Origin", "https://unrelated.test")).status).toBe(403);
  });
  it("limits OAuth returns to internal destinations", async () => {
    const response = await request(app).get("/api/v1/auth/github").query({ mode: "json", returnTo: "https://other.test" });
    expect(response.status).toBe(200);
    expect(new URL(response.body.authorizationUrl).origin).toBe("https://github.com");
    expect(response.headers["set-cookie"].join(";")).toContain("Path=/api;");
  });
});

