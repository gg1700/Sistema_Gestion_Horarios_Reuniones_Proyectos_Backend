import { describe, expect, it } from "vitest";
import {
  filterPublicProfile,
  type PublicProfileInput,
} from "../src/services/public-profile-filter.service";

function createProfile(
  general: boolean | undefined,
  individual: boolean,
): PublicProfileInput {
  return {
    id: "internal-user",
    handleName: "usuario-prueba",
    name: "Usuario",
    firstSurname: "Prueba",
    email: "private@example.test",
    profilePicture: null,
    requiresProfileCompletion: false,
    surname: null,
    phones: [],
    contactEmails: [],
    addresses: [],
    countries: [],
    workExperiences: [],
    links: [],

    sectionVisibility: general === undefined
      ? undefined
      : {
          repositories: general,
          githubActivity: general,
        },

    repositories: [
      {
        name: "repositorio",
        url: "https://github.com/example/repositorio",
        visible: individual,
      },
    ],

    githubActivityList: [
      {
        activity: "actividad",
        visible: individual,
      },
    ],

    githubActivityGrid: [
      {
        activity: "contribuciones",
        visible: individual,
      },
    ],
  };
}

describe("Permisos generales en el perfil público", () => {
  it.each([
    {
      name: "sin configuración general",
      general: undefined,
      individual: true,
      expected: 0,
    },
    {
      name: "ambos permisos apagados",
      general: false,
      individual: false,
      expected: 0,
    },
    {
      name: "solo permiso individual activo",
      general: false,
      individual: true,
      expected: 0,
    },
    {
      name: "solo permiso general activo",
      general: true,
      individual: false,
      expected: 0,
    },
    {
      name: "ambos permisos activos",
      general: true,
      individual: true,
      expected: 1,
    },
  ])("$name", ({ general, individual, expected }) => {
    const result = filterPublicProfile(
      createProfile(general, individual),
    );

    expect(result.repositories).toHaveLength(expected);
    expect(result.githubActivityList).toHaveLength(expected);
    expect(result.githubActivityGrid).toHaveLength(expected);
  });

  it("repositorios y actividad tienen permisos generales independientes", () => {
    const profile = createProfile(true, true);

    profile.sectionVisibility = {
      repositories: true,
      githubActivity: false,
    };

    const result = filterPublicProfile(profile);

    expect(result.repositories).toHaveLength(1);
    expect(result.githubActivityList).toEqual([]);
    expect(result.githubActivityGrid).toEqual([]);
  });
});