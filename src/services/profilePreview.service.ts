import { getOwnProfile } from "./profile.service";
import { filterPublicProfile } from "./public-profile-filter.service";
import { findSectionVisibility } from "../repositories/visibility.repository";
import { findPublicRepositories } from "../repositories/github-repository.repository";

export async function getProfilePreview(userId: string) {
  const profile = await getOwnProfile(userId);
  const sectionVisibility = await findSectionVisibility(userId);

  const repositories = sectionVisibility.repositories
    ? await findPublicRepositories(userId)
    : [];

  return filterPublicProfile({
    ...profile,
    sectionVisibility,
    repositories,
  });
}
