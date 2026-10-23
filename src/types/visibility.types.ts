
export const visibilityTypes = [
  "surname",
  "email",
  "phone",
  "address",
  "country",
  "workExperience",
  "link",
  "repositories",
  "githubActivity"
] as const;

export type VisibilityType = typeof visibilityTypes[number];

export interface VisibilityChange {
  type: VisibilityType;
  id?: string;
  visible: boolean;
}

export interface VisibilityRequest {
  changes: VisibilityChange[];
}
