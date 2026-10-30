export const recordVisibilityTypes = [
  "surname",
  "email",
  "phone",
  "address",
  "country",
  "workExperience",
  "link",
  "repository",
  "githubActivityList",
  "githubActivityGrid",
] as const;

export const generalVisibilityTypes = [
  "repositories",
  "githubActivity",
] as const;

export const visibilityTypes = [
  ...recordVisibilityTypes,
  ...generalVisibilityTypes,
] as const;

export type RecordVisibilityType =
  typeof recordVisibilityTypes[number];

export type GeneralVisibilityType =
  typeof generalVisibilityTypes[number];

export type VisibilityType = typeof visibilityTypes[number];

export type VisibilitySection = "repositories" | "github_activity";

export interface SectionVisibility {
  repositories: boolean;
  githubActivity: boolean;
}

export interface VisibilityChange {
  type: VisibilityType;
  id?: string;
  visible: boolean;
}

export interface VisibilityRequest {
  changes: VisibilityChange[];
}