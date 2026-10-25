import request from "supertest";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { app } from "../src/config/server.config";
import pool from "../src/config/database.config";
import * as SessionService from "../src/services/session.service";

const profileRoute = "/api/v1/profile";

const validAdditionalInfo = {
  surname: { surname: "lopez", visibility: false },
  phones: [{ phoneNumber: "71234567", countryCode: "+591" }],
  contactEmails: [{ email: "Contacto.Test@Mail.com" }],
  addresses: [{ address: "av. america 123" }],
  links: [{ text: "github", url: "github.com/test-profile" }],
  countries: [{ countryName: "bolivia" }],
  workExperiences: [{ title: "desarrollador backend", companyName: "empresa", startDate: "2024-01-15", endDate: "2025-02-01" }]
};

async function deleteTestUsers() {
  await pool.query(`DELETE FROM "user" WHERE handle_name LIKE 'test-%'`);
}

async function registerTestUser() {
  const registration = SessionService.createRegistrationToken({ email: "test.profile@mail.com", provider: "google" });
  const response = await request(app).post("/api/v1/auth/register").set("Authorization", `Bearer ${registration.token}`).send({
    handleName: "test-profile",
    name: "ana",
    firstSurname: "perez"
  });
  return `Bearer ${response.body.data.session.token}`;
}

describe("POST /api/v1/profile", () => {
  let authorization = "";

  beforeEach(async () => {
    await deleteTestUsers();
    authorization = await registerTestUser();
  });

  afterAll(async () => {
    await deleteTestUsers();
    await pool.end();
  });

  it("creates the additional information in one transaction", async () => {
    const response = await request(app).post(profileRoute).set("Authorization", authorization).send(validAdditionalInfo);

    expect(response.body).toMatchObject({ success: true });
    expect(response.status).toBe(201);

    const { rows } = await pool.query(
      `SELECT l.url, w.title, w.company_name FROM "user" u
       JOIN "link" l ON l.user_id = u.id
       JOIN "workexperience" w ON w.user_id = u.id
       WHERE u.handle_name = 'test-profile'`
    );
    expect(rows[0].url).toBe("https://github.com/test-profile");
    expect(rows[0].title).toBe("desarrollador backend");
  });

  it("accepts form data with lists sent as JSON text", async () => {
    const response = await request(app)
      .post(profileRoute)
      .set("Authorization", authorization)
      .field("links", JSON.stringify(validAdditionalInfo.links))
      .field("countries", JSON.stringify(validAdditionalInfo.countries));

    expect(response.status).toBe(201);
  });

  it("returns 409 when the user already registered additional information", async () => {
    await request(app).post(profileRoute).set("Authorization", authorization).send(validAdditionalInfo);
    const response = await request(app).post(profileRoute).set("Authorization", authorization).send(validAdditionalInfo);

    expect(response.status).toBe(409);
  });

  it("returns 400 when every field is empty", async () => {
    const response = await request(app)
      .post(profileRoute)
      .set("Authorization", authorization)
      .send({ surname: "", phones: [], links: [], workExperiences: null });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("returns 400 when the data is invalid", async () => {
    const invalidPayloads = [
      { phones: [{ phoneNumber: "12", countryCode: "591" }] },
      { contactEmails: [{ email: "invalid-email" }] },
      { workExperiences: [{ title: "dev", startDate: "15/01/2024" }] },
      { workExperiences: [{ title: "dev", startDate: "2024-05-01", endDate: "2024-01-01" }] },
      { countries: [{ countryName: "Atlantida" }] },
      { links: Array.from({ length: 6 }, (_, index) => ({ text: `link ${index}`, url: `site${index}.com` })) }
    ];

    for (const invalidPayload of invalidPayloads) {
      const response = await request(app).post(profileRoute).set("Authorization", authorization).send(invalidPayload);
      expect(response.status).toBe(400);
    }
  });

  it("returns 400 when a link has an invalid URL", async () => {
    const response = await request(app)
      .post(profileRoute)
      .set("Authorization", authorization)
      .send({ links: [{ text: "mi sitio", url: "javascript:alert(1)" }] });

    expect(response.status).toBe(400);
  });

  it("returns 401 when the request has no session", async () => {
    const withoutSession = await request(app).post(profileRoute).send(validAdditionalInfo);
    const invalidSession = await request(app).post(profileRoute).set("Authorization", "Bearer invalid-token").send(validAdditionalInfo);

    expect(withoutSession.status).toBe(401);
    expect(invalidSession.status).toBe(401);
  });
});
