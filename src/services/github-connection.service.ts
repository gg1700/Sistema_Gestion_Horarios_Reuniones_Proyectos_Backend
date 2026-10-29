import * as repository from "../repositories/github-connection.repository";
import { normalizeScopes } from "../repositories/auth-session.repository";
import { decryptToken } from "../utils/token";
import { GitHubClient, GitHubClientError } from "../integrations/github/github.client";

export async function requireGitHubClient(userId: string) {
  const account = await repository.findGitHubAccount(userId);
  if (!account) throw new GitHubClientError("GITHUB_NOT_CONNECTED", 409, "Vincula GitHub desde tus conexiones.");
  if (account.state !== "active" || (account.access_expires_at && new Date(account.access_expires_at).getTime() <= Date.now())) {
    throw new GitHubClientError("GITHUB_REAUTH_REQUIRED", 409, "Vuelve a autorizar tu cuenta de GitHub.");
  }
  let token: string;
  try { token = decryptToken(account.access_token); }
  catch { throw new GitHubClientError("GITHUB_REAUTH_REQUIRED", 409, "Vuelve a autorizar tu cuenta de GitHub."); }
  return { account, client: new GitHubClient(token) };
}

export async function verifyGitHubConnection(userId: string) {
  const { account, client } = await requireGitHubClient(userId);
  try {
    const { data, headers } = await client.get<{ id: number | string; login: string }>("/user");
    if (!data || String(data.id) !== account.provider_user_id || typeof data.login !== "string" || !data.login) {
      throw new GitHubClientError("GITHUB_REAUTH_REQUIRED", 409, "La cuenta autorizada no coincide con la vinculada.");
    }
    const scopes = normalizeScopes(headers.has("x-oauth-scopes") ? headers.get("x-oauth-scopes") : account.scopes);
    await repository.updateGitHubMetadata(account, data.login, scopes);
    return { connected: true, username: data.login, permissions: {
      canReadPublicRepositories: true, canReadPrivateRepositories: scopes.includes("repo"),
    }, checkedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof GitHubClientError && error.code === "GITHUB_REAUTH_REQUIRED") await repository.markGitHubExpired(account);
    throw error;
  }
}

