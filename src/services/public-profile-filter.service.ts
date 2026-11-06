import type { Profile } from "../types/profile-response.types";
import type { SectionVisibility } from "../types/visibility.types";

type VisibleRecord = {
  visible?: boolean | null;
};

type PublicRepositoryInput = VisibleRecord & {
  name: string;
  description?: string | null;
  language?: string | null;
  stars?: number;
  url: string;
};

type PublicActivityInput = VisibleRecord & {
  activity: string;
};

export interface PublicProfileInput extends Profile {
  sectionVisibility?: Partial<SectionVisibility>;
  repositories?: PublicRepositoryInput[];
  githubActivityList?: PublicActivityInput[];
  githubActivityGrid?: PublicActivityInput[];
}

export function filterPublicProfile(profile: PublicProfileInput) {
  const repositoriesVisible =
    profile.sectionVisibility?.repositories === true;

  const githubActivityVisible =
    profile.sectionVisibility?.githubActivity === true;

  return {
    handleName: profile.handleName,
    name: profile.name,
    firstSurname: profile.firstSurname,
    profilePicture: profile.profilePicture,

    surname: profile.surname?.visible === true
      ? profile.surname.surname
      : null,

    phones: (profile.phones ?? [])
      .filter((item) => item.visible === true)
      .map((item) => ({
        phoneNumber: item.phoneNumber,
        countryCode: item.countryCode,
        countryName: item.countryName,
      })),

    contactEmails: (profile.contactEmails ?? [])
      .filter((item) => item.visible === true)
      .map((item) => ({
        email: item.email,
      })),

    addresses: (profile.addresses ?? [])
      .filter((item) => item.visible === true)
      .map((item) => ({
        address: item.address,
      })),

    countries: (profile.countries ?? [])
      .filter((item) => item.visible === true)
      .map((item) => ({
        countryName: item.countryName,
        countryCode: item.countryCode,
      })),

    workExperiences: (profile.workExperiences ?? [])
      .filter((item) => item.visible === true)
      .map((item) => ({
        title: item.title,
        description: item.description,
        companyName: item.companyName,
        startDate: item.startDate,
        endDate: item.endDate,
      })),

    links: (profile.links ?? [])
      .filter((item) => item.visible === true)
      .map((item) => ({
        text: item.text,
        url: item.url,
      })),

    repositories: (profile.repositories ?? [])
      .filter((item) =>
        repositoriesVisible && item.visible === true
      )
      .map((item) => ({
        name: item.name,
        description: item.description ?? null,
        language: item.language ?? null,
        stars: item.stars ?? 0,
        url: item.url,
      })),

    githubActivityList: (profile.githubActivityList ?? [])
      .filter((item) =>
        githubActivityVisible && item.visible === true
      )
      .map((item) => ({
        activity: item.activity,
      })),

    githubActivityGrid: (profile.githubActivityGrid ?? [])
      .filter((item) =>
        githubActivityVisible && item.visible === true
      )
      .map((item) => ({
        activity: item.activity,
      })),
  };
}