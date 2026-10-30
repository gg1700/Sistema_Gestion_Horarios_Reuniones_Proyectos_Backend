import { afterEach, describe, expect, it, vi } from "vitest";
import * as ProfileRepo from "../src/repositories/profile.repository";
import * as ProfileReadRepo from "../src/repositories/profile-read.repository";
import { getPublicProfile } from "../src/services/profile.service";

function prepareProfile() {
  vi.spyOn(ProfileRepo, "findPublicProfileByHandle").mockResolvedValue({
    id: "usuario-prueba-id",
    handle_name: "usuario-demo",
    name: "Ana",
    first_surname: "Lopez",
    profile_picture: null
  });

  vi.spyOn(ProfileReadRepo, "findOwnProfile").mockResolvedValue({
    id: "usuario-prueba-id",
    handle_name: "usuario-demo",
    name: "Ana",
    first_surname: "Lopez",
    email: "correo-privado@example.com",
    access_token: "token-privado",
    profile_picture: null,
    surname: null,
    phones: [{
      id: "telefono-privado",
      phoneNumber: "70000000",
      countryCode: "591",
      countryName: "Bolivia",
      visible: false
    }],
    contact_emails: [],
    addresses: [],
    countries: [],
    work_experiences: [],
    links: []
  } as any);

  vi.spyOn(ProfileRepo, "findPublicGitHubState").mockResolvedValue({
    repositoriesVisible: false,
    activityVisible: false,
    githubConnected: true,
    activityList: JSON.stringify([{
      type: "PushEvent",
      repo: { name: "equipo/proyecto" },
      date: "2026-10-29",
      payload: { secret: "informacion-privada" }
    }]),
    activityGrid: JSON.stringify({
      totalContributions: 15
    })
  });
}

describe("T-51 - Consulta del perfil publico", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devuelve null cuando no existe el perfil", async () => {
    vi.spyOn(
      ProfileRepo,
      "findPublicProfileByHandle"
    ).mockResolvedValue(null);

    expect(await getPublicProfile("usuario-inexistente"))
      .toBeNull();
  });

  it("oculta los datos privados y las secciones desactivadas", async () => {
    prepareProfile();

    const profile = await getPublicProfile("usuario-demo");

    expect(profile).toMatchObject({
      handleName: "usuario-demo",
      name: "Ana",
      firstSurname: "Lopez",
      phones: [],
      repositories: [],
      githubActivityList: [],
      githubActivityGrid: []
    });

    const response = JSON.stringify(profile);

    expect(response).not.toContain("correo-privado@example.com");
    expect(response).not.toContain("token-privado");
    expect(response).not.toContain("70000000");
    expect(response).not.toContain("informacion-privada");
    expect(response).not.toContain("usuario-prueba-id");
  });

  it("publica solamente el resumen permitido de actividad", async () => {
    prepareProfile();

    vi.mocked(ProfileRepo.findPublicGitHubState).mockResolvedValue({
      repositoriesVisible: false,
      activityVisible: true,
      githubConnected: true,
      activityList: JSON.stringify([{
        type: "PushEvent",
        repo: { name: "equipo/proyecto" },
        date: "2026-10-29",
        payload: { secret: "informacion-privada" }
      }]),
      activityGrid: JSON.stringify({
        totalContributions: 15
      })
    });

    const profile = await getPublicProfile("usuario-demo");

    expect(profile?.githubActivityList).toHaveLength(1);
    expect(profile?.githubActivityGrid).toHaveLength(1);
    expect(JSON.stringify(profile)).not.toContain("informacion-privada");
  });
});
