import type { Octokit } from "octokit";
import { decryptToken } from "../utils/token";
import * as Repository from "../repositories/github-repository.repository";
import { createGithubClient, GithubRepositoryError, githubRequestError } from "./github-client.service";
import type { GithubRepository, GithubRepositoryAccount } from "../types/github-repository.types";

export const MAX_SELECTED_REPOSITORIES = 5;

export function validateRepositorySelection(body: unknown): number[] {
  const ids = (body as { repositoryIds?: unknown })?.repositoryIds;
  if (!Array.isArray(ids) || ids.length > MAX_SELECTED_REPOSITORIES ||
      ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new GithubRepositoryError(422, "INVALID_SELECTION", `Envía de 0 a ${MAX_SELECTED_REPOSITORIES} IDs numéricos distintos en repositoryIds.`);
  }
  return ids;
}

/** T-43: páginas de 100, orden global de GitHub por último push. */
export async function fetchGithubRepositories(client: Octokit, account: GithubRepositoryAccount) {
  const user = await client.request("GET /user", { headers: { "X-GitHub-Api-Version": "2026-03-10" } });
  if (String(user.data.id) !== account.provider_user_id) {
    throw new GithubRepositoryError(409, "GITHUB_REAUTH_REQUIRED", "La identidad de GitHub cambió. Vuelve a autorizarla.");
  }
  // La cabecera del token es autoritativa, incluso cuando está vacía.
  const scopes = (user.headers["x-oauth-scopes"] ?? account.scopes ?? "").split(/[\s,]+/);
  const canReadPrivate = scopes.includes("repo");
  const repositories = new Map<number, GithubRepository>();
  for await (const page of client.paginate.iterator("GET /user/repos", {
    affiliation: "owner", sort: "pushed", direction: "desc", per_page: 100,
    visibility: canReadPrivate ? "all" : "public",
  })) {
    for (const repo of page.data) {
      const visibility = repo.private ? "private" : repo.visibility === "internal" ? "internal" : "public";
      if ((!canReadPrivate && visibility !== "public") || String(repo.owner.id) !== account.provider_user_id) continue;
      repositories.set(repo.id, {
        id: repo.id, name: repo.name, description: repo.description ?? null,
        language: repo.language ?? null, stars: repo.stargazers_count ?? 0,
        url: repo.html_url, private: repo.private, visibility,
      });
    }
  }
  return { repositories: [...repositories.values()], username: user.data.login };
}

async function loadRepositories(userId: string) {
  const account = await Repository.findGithubRepositoryAccount(userId);
  if (!account) throw new GithubRepositoryError(409, "GITHUB_NOT_CONNECTED", "Vincula tu cuenta de GitHub para consultar repositorios.");
  if (account.state !== "active" || (account.access_expires_at && new Date(account.access_expires_at).getTime() <= Date.now())) {
    throw new GithubRepositoryError(409, "GITHUB_REAUTH_REQUIRED", "Vuelve a autorizar tu cuenta de GitHub.");
  }
  try {
    const client = await createGithubClient(decryptToken(account.access_token));
    const result = await fetchGithubRepositories(client, account);
    return { account: { ...account, provider_username: result.username }, ...result };
  } catch (error) {
    const failure = error instanceof GithubRepositoryError ? error : githubRequestError(error);
    if (failure.code === "GITHUB_REAUTH_REQUIRED") await Repository.expireGithubRepositoryAccount(userId, account);
    throw failure;
  }
}

export async function listGithubRepositories(userId: string) {
  const { account, repositories, username } = await loadRepositories(userId);
  const { saved, removedIds } = await Repository.syncRepositorySelection(userId, account, repositories);
  return {
    username, maxSelected: MAX_SELECTED_REPOSITORIES,
    selectedIds: saved.map(repo => Number(repo.github_repo_id)),
    warnings: removedIds.length ? ["Se retiraron de tu selección repositorios que dejaron de estar disponibles o de ser públicos."] : [],
    repositories: repositories.map(repo => {
      const selected = saved.find(item => Number(item.github_repo_id) === repo.id);
      return { ...repo, selected: Boolean(selected), selectionId: selected?.id ?? null, visible: selected?.visible ?? false };
    }),
  };
}

export async function saveGithubRepositories(userId: string, body: unknown) {
  const ids = validateRepositorySelection(body);
  const { account, repositories } = await loadRepositories(userId);
  if (ids.some(id => !repositories.some(repo => repo.id === id && repo.visibility === "public" && !repo.private))) {
    throw new GithubRepositoryError(422, "INVALID_REPOSITORY", "Un repositorio no pertenece a tu cuenta o no es público. Actualiza la lista.");
  }
  const { saved } = await Repository.syncRepositorySelection(userId, account, repositories, ids);
  return { selectedIds: saved.map(repo => Number(repo.github_repo_id)), maxSelected: MAX_SELECTED_REPOSITORIES };
}
