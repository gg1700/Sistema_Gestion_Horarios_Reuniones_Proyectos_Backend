export interface GithubRepository {
  id: number;
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
  url: string;
  private: boolean;
  visibility: "public" | "private" | "internal";
}

export interface SavedRepository {
  id: string;
  github_repo_id: string;
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
  url: string;
  display_order: number;
  visible: boolean;
  github_visibility: string;
  synced_at: Date;
}

export interface GithubRepositoryAccount {
  id: string;
  provider_user_id: string;
  provider_username: string;
  access_token: string;
  access_expires_at: Date | null;
  scopes: string | null;
  state: string;
}
