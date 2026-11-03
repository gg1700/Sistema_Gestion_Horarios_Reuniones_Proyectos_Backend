import { createHmac } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifySession: vi.fn(),
  isActiveProfileUser: vi.fn(),
  getOwnProfile: vi.fn(),
  getPublicProfile: vi.fn(),
  findSectionVisibility: vi.fn(),
  upsertSectionVisibility: vi.fn(),
  findPublicRepositories: vi.fn(),
}));

vi.mock("../src/services/session.service", () => ({
  verifySession: mocks.verifySession,
}));

vi.mock("../src/repositories/profile-read.repository", () => ({
  isActiveProfileUser: mocks.isActiveProfileUser,
}));

vi.mock("../src/services/profile.service", () => ({
  getOwnProfile: mocks.getOwnProfile,
  getPublicProfile: mocks.getPublicProfile,
}));

vi.mock("../src/repositories/visibility.repository", () => ({
  findSectionVisibility: mocks.findSectionVisibility,
  upsertSectionVisibility: mocks.upsertSectionVisibility,
}));

vi.mock("../src/repositories/github-repository.repository", () => ({
  findPublicRepositories: mocks.findPublicRepositories,
}));

import { app } from "../src/config/server.config";
import { env } from "../src/config/env.config";
import { AuthenticationError } from "../src/helpers/errors.helper";

const route = "/api/v1/profile/preview";
const userId = "07a6ee45-42fd-4e8f-9176-230e43d89759";
const otherId = "d707f963-9ef8-4c61-830c-b390a9cf9317";
const authorization = "Bearer valid-session";

function privateProfile() {
  return {
    id: userId,
    handleName: "preview-owner",
    name: "Ana",
    firstSurname: "Perez",
    email: "private-login@example.test",
    profilePicture: null,
    requiresProfileCompletion: false,
    publicLinkActive: false,
    accessToken: "never-return-this-token",
    surname: { surname: "Privado", visible: false },
    contactEmails: [
      { id: "private-contact-id", email: "contact@example.test", visible: false },
    ],
    phones: [
      {
        id: "private-phone-id",
        phoneNumber: "71234567",
        countryCode: "591",
        countryName: "Bolivia",
        visible: false,
      },
    ],
    addresses: [
      { id: "private-address-id", address: "Direccion privada", visible: false },
    ],
    countries: [
      {
        id: "private-country-id",
        countryName: "Bolivia",
        countryCode: "BO",
        visible: false,
      },
    ],
    workExperiences: [
      {
        id: "private-work-id",
        title: "Desarrolladora",
        companyName: "Empresa",
        description: "Descripcion privada",
        startDate: "2024-01-01",
        endDate: null,
        visible: false,
      },
    ],
    links: [
      {
        id: "private-link-id",
        text: "Portafolio",
        url: "https://example.test",
        visible: false,
      },
    ],
  };
}

const getPreview = () =>
  request(app).get(route).set("Authorization", authorization);

beforeEach(() => {
  vi.resetAllMocks();

  mocks.verifySession.mockImplementation((token: string) => {
    if (token !== "valid-session") throw new Error("Token invalido");
    return { userId, handlename: "preview-owner" };
  });

  mocks.isActiveProfileUser.mockResolvedValue(true);
  mocks.getOwnProfile.mockResolvedValue(privateProfile());
  mocks.getPublicProfile.mockResolvedValue(null);
  mocks.findSectionVisibility.mockResolvedValue({
    repositories: false,
    githubActivity: false,
  });
  mocks.findPublicRepositories.mockResolvedValue([]);
});

describe("GET /api/v1/profile/preview", () => {
  it("requiere una sesion", async () => {
    await request(app).get(route).expect(401);
    expect(mocks.getOwnProfile).not.toHaveBeenCalled();
  });

  it("rechaza una sesion invalida", async () => {
    await request(app)
      .get(route)
      .set("Authorization", "Bearer invalid-session")
      .expect(401);

    expect(mocks.getOwnProfile).not.toHaveBeenCalled();
  });

  it("acepta la cookie de sesion firmada", async () => {
    const token = "valid-session";
    const signature = createHmac("sha256", env.COOKIE_SECRET)
      .update(token)
      .digest("base64")
      .replace(/=+$/, "");

    await request(app)
      .get(route)
      .set("Cookie", `session=${encodeURIComponent(`s:${token}.${signature}`)}`)
      .expect(200);

    expect(mocks.getOwnProfile).toHaveBeenCalledWith(userId);
  });

  it("rechaza un usuario que ya no esta disponible", async () => {
    mocks.isActiveProfileUser.mockResolvedValue(false);

    await getPreview().expect(401);
    expect(mocks.getOwnProfile).not.toHaveBeenCalled();
  });

  it("incluye identidad publica y excluye datos ocultos e internos", async () => {
    const response = await getPreview().expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        handleName: "preview-owner",
        name: "Ana",
        firstSurname: "Perez",
        profilePicture: null,
        surname: null,
        phones: [],
        contactEmails: [],
        addresses: [],
        countries: [],
        workExperiences: [],
        links: [],
        repositories: [],
        githubActivityList: [],
        githubActivityGrid: [],
      },
    });

    const serialized = JSON.stringify(response.body);

    for (const hidden of [
      userId,
      "private-login@example.test",
      "contact@example.test",
      "private-contact-id",
      "private-phone-id",
      "71234567",
      "Direccion privada",
      "Descripcion privada",
      "never-return-this-token",
    ]) {
      expect(serialized).not.toContain(hidden);
    }

    expect(mocks.upsertSectionVisibility).not.toHaveBeenCalled();
  });

  it("devuelve solo los contactos marcados visibles", async () => {
    const profile = privateProfile();
    profile.contactEmails[0].visible = true;
    profile.phones[0].visible = true;
    mocks.getOwnProfile.mockResolvedValue(profile);

    const response = await getPreview().expect(200);

    expect(response.body.data.contactEmails).toEqual([
      { email: "contact@example.test" },
    ]);
    expect(response.body.data.phones).toEqual([
      {
        phoneNumber: "71234567",
        countryCode: "591",
        countryName: "Bolivia",
      },
    ]);
    expect(response.body.data.email).toBeUndefined();
    expect(response.body.data.id).toBeUndefined();
  });

  it("usa solamente el usuario de la sesion, aunque la query indique otro", async () => {
    await request(app)
      .get(route)
      .query({ userId: otherId })
      .set("Authorization", authorization)
      .expect(200);

    expect(mocks.getOwnProfile).toHaveBeenCalledWith(userId);
    expect(mocks.findSectionVisibility).toHaveBeenCalledWith(userId);
    expect(mocks.getOwnProfile).not.toHaveBeenCalledWith(otherId);
  });

  it("oculta repositorios y evita consultarlos si el general esta apagado", async () => {
    mocks.findPublicRepositories.mockResolvedValue([
      { name: "oculto", url: "https://github.com/ana/oculto", visible: true },
    ]);

    const response = await getPreview().expect(200);

    expect(response.body.data.repositories).toEqual([]);
    expect(mocks.findPublicRepositories).not.toHaveBeenCalled();
  });

  it("exige permiso general e individual para mostrar repositorios", async () => {
    mocks.findSectionVisibility.mockResolvedValue({
      repositories: true,
      githubActivity: false,
    });

    mocks.findPublicRepositories.mockResolvedValue([
      {
        name: "publico",
        description: null,
        language: null,
        stars: 2,
        url: "https://github.com/ana/publico",
        visible: true,
      },
      {
        name: "oculto",
        url: "https://github.com/ana/oculto",
        visible: false,
      },
    ]);

    const response = await getPreview().expect(200);

    expect(mocks.findPublicRepositories).toHaveBeenCalledWith(userId);
    expect(response.body.data.repositories).toEqual([
      {
        name: "publico",
        description: null,
        language: null,
        stars: 2,
        url: "https://github.com/ana/publico",
      },
    ]);
  });

  it("permite la vista previa aunque el perfil publico no este disponible", async () => {
    await request(app)
      .get("/api/v1/public/profiles/preview-owner")
      .expect(404);

    mocks.getPublicProfile.mockClear();

    const response = await getPreview().expect(200);

    expect(response.body.data.handleName).toBe("preview-owner");
    expect(mocks.getPublicProfile).not.toHaveBeenCalled();
    expect(response.body.data.publicLinkActive).toBeUndefined();
  });

  it("consulta de nuevo la configuracion y no conserva una respuesta anterior", async () => {
    const initial = await getPreview().expect(200);
    expect(initial.body.data.contactEmails).toEqual([]);

    const profile = privateProfile();
    profile.contactEmails[0].visible = true;
    mocks.getOwnProfile.mockResolvedValue(profile);

    const updated = await getPreview().expect(200);
    expect(updated.body.data.contactEmails).toEqual([
      { email: "contact@example.test" },
    ]);
  });

  it("marca la respuesta privada como no almacenable", async () => {
    const response = await getPreview().expect(200);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("devuelve 401 si el usuario deja de estar disponible durante la consulta", async () => {
    mocks.getOwnProfile.mockRejectedValue(
      new AuthenticationError("Usuario eliminado"),
    );

    await getPreview().expect(401);
  });

  it("devuelve un error generico sin filtrar detalles internos", async () => {
    mocks.getOwnProfile.mockRejectedValue(
      new Error("SQL secret internal error"),
    );

    const response = await getPreview().expect(500);

    expect(response.body).toEqual({
      success: false,
      message: "No se pudo consultar la vista previa del perfil",
    });
    expect(JSON.stringify(response.body)).not.toContain("SQL secret");
  });
});
