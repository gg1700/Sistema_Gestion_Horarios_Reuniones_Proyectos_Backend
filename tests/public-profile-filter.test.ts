import { describe, expect, it } from "vitest";
import {
  filterPublicProfile,
  type PublicProfileInput
} from "../src/services/public-profile-filter.service";

const profile: PublicProfileInput = {
  id: "internal-user-id",
  handleName: "jherlan",
  name: "Jherlan",
  firstSurname: "Calero",
  email: "login@private.test",
  profilePicture: null,
  requiresProfileCompletion: false,

    sectionVisibility: {
    repositories: true,
    githubActivity: true,
  },

  surname: {
    surname: "Segundo",
    visible: false
  },

  phones: [
    {
      id: "phone-1",
      phoneNumber: "70000001",
      countryCode: "+591",
      countryName: "Bolivia",
      visible: true
    },
    {
      id: "phone-2",
      phoneNumber: "70000002",
      countryCode: "+591",
      countryName: "Bolivia",
      visible: false
    }
  ],

  contactEmails: [
    {
      id: "email-1",
      email: "public@test.com",
      visible: true
    }
  ],

  addresses: [
    {
      id: "address-1",
      address: "Privada",
      visible: false
    }
  ],

  countries: [],

  workExperiences: [],

  links: [
    {
      id: "link-1",
      text: "GitHub",
      url: "https://example.com",
      visible: true
    }
  ],

  repositories: [
    {
      name: "repo-public",
      url: "https://example.com/public",
      visible: true
    },
    {
      name: "repo-private",
      url: "https://example.com/private",
      visible: false
    }
  ],

  githubActivityList: [
    {
      activity: "public activity",
      visible: true
    }
  ],

  githubActivityGrid: [
    {
      activity: "private activity",
      visible: false
    }
  ]
};

describe("filterPublicProfile", () => {

  it("mantiene los datos siempre públicos", () => {
    const result = filterPublicProfile(profile);

    expect(result.handleName).toBe("jherlan");
    expect(result.name).toBe("Jherlan");
    expect(result.firstSurname).toBe("Calero");
    expect(result.profilePicture).toBeNull();
  });

  it("filtra registros privados y conserva los públicos", () => {
    const result = filterPublicProfile(profile);

    expect(result.phones).toHaveLength(1);
    expect(result.phones[0].phoneNumber).toBe("70000001");
    expect(result.contactEmails).toEqual([
      { email: "public@test.com" }
    ]);
    expect(result.addresses).toEqual([]);
    expect(result.surname).toBeNull();
    expect(result.links).toHaveLength(1);
  });

  it("no expone identificadores ni correo de acceso", () => {
    const result = JSON.stringify(filterPublicProfile(profile));

    expect(result).not.toContain("internal-user-id");
    expect(result).not.toContain("login@private.test");
    expect(result).not.toContain("phone-1");
    expect(result).not.toContain('"visible"');
  });

  it("filtra las tres categorías de GitHub", () => {
    const result = filterPublicProfile(profile);

    expect(result.repositories.map(item => item.name)).toEqual([
      "repo-public"
    ]);

    expect(result.githubActivityList).toEqual([
      { activity: "public activity" }
    ]);

    expect(result.githubActivityGrid).toEqual([]);
  });

  it("no muestra registros con visibilidad ausente", () => {
    const result = filterPublicProfile({
      ...profile,

      phones: [
        {
          ...profile.phones[0],
          visible: undefined as unknown as boolean
        }
      ],

      repositories: [
        {
          name: "sin configuración",
          url: "https://example.com"
        }
      ],

      githubActivityList: undefined
    });

    expect(result.phones).toEqual([]);
    expect(result.repositories).toEqual([]);
    expect(result.githubActivityList).toEqual([]);
  });

  it("devuelve solo información básica cuando todo es privado", () => {
    const result = filterPublicProfile({
      ...profile,

      phones: profile.phones.map(item => ({
        ...item,
        visible: false
      })),

      contactEmails: profile.contactEmails.map(item => ({
        ...item,
        visible: false
      })),

      links: profile.links.map(item => ({
        ...item,
        visible: false
      })),

      repositories: profile.repositories?.map(item => ({
        ...item,
        visible: false
      })),

      githubActivityList: profile.githubActivityList?.map(item => ({
        ...item,
        visible: false
      }))
    });

    expect(result.phones).toEqual([]);
    expect(result.contactEmails).toEqual([]);
    expect(result.links).toEqual([]);
    expect(result.repositories).toEqual([]);
    expect(result.githubActivityList).toEqual([]);
    expect(result.handleName).toBe("jherlan");
  });

});