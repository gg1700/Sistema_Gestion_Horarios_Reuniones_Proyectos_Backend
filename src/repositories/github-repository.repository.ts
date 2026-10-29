import type { PoolClient } from "pg";
import { processReturnQuery, processTransaction } from "../utils/query";
import { GithubRepositoryError } from "../services/github-client.service";
import type { GithubRepository, GithubRepositoryAccount, SavedRepository } from "../types/github-repository.types";

export async function findGithubRepositoryAccount(userId: string): Promise<GithubRepositoryAccount | null> {
  const rows = await processReturnQuery(`SELECT id, provider_user_id, provider_username, access_token,
    access_expires_at, scopes, state FROM public.external_account WHERE user_id = $1 AND provider = 'github'`, [userId]);
  return rows[0] ?? null;
}

export async function expireGithubRepositoryAccount(userId: string, account: GithubRepositoryAccount) {
  // No caducar un token renovado mientras la petición anterior estaba en vuelo.
  await processReturnQuery(`UPDATE public.external_account SET state = 'expired', updated_at = NOW()
    WHERE user_id = $1 AND id = $2 AND access_token = $3`, [userId, account.id, account.access_token]);
}

export async function findSavedRepositories(userId: string): Promise<SavedRepository[]> {
  return processReturnQuery(`SELECT * FROM public.repository WHERE user_id = $1 ORDER BY display_order`, [userId]);
}

async function lockAccount(client: PoolClient, userId: string, account: GithubRepositoryAccount) {
  const user = await client.query(`SELECT id FROM public."user" WHERE id = $1 AND status = 'active' AND deleted_at IS NULL FOR UPDATE`, [userId]);
  if (!user.rowCount) throw new GithubRepositoryError(401, "INVALID_SESSION", "La sesión ya no está disponible.");
  const current = await client.query(`SELECT id FROM public.external_account
    WHERE user_id = $1 AND provider = 'github' AND id = $2 AND access_token = $3 AND state = 'active' FOR UPDATE`,
  [userId, account.id, account.access_token]);
  if (!current.rowCount) throw new GithubRepositoryError(409, "GITHUB_REAUTH_REQUIRED", "La conexión cambió. Vuelve a consultar tus repositorios.");
  await client.query(`UPDATE public.external_account SET provider_username = $2 WHERE id = $1`, [account.id, account.provider_username]);
}

async function upsertSnapshot(client: PoolClient, userId: string, repo: GithubRepository, order: number) {
  await client.query(`INSERT INTO public.repository
    (user_id, github_repo_id, name, description, language, stars, url, display_order, github_visibility, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'public',NOW())
    ON CONFLICT (user_id, github_repo_id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
      language = EXCLUDED.language, stars = EXCLUDED.stars, url = EXCLUDED.url,
      display_order = EXCLUDED.display_order, github_visibility = 'public', synced_at = NOW()`,
  [userId, repo.id, repo.name, repo.description, repo.language, repo.stars, repo.url, order]);
}

/** Reconciliar solo después de recibir TODAS las páginas correctamente. */
export async function syncRepositorySelection(userId: string, account: GithubRepositoryAccount, available: GithubRepository[], requestedIds?: number[]) {
  return processTransaction(async client => {
    await lockAccount(client, userId, account);
    const { rows: old } = await client.query<SavedRepository>(`SELECT * FROM public.repository WHERE user_id = $1 ORDER BY display_order`, [userId]);
    const eligible = new Map(available.filter(repo => repo.visibility === "public" && !repo.private).map(repo => [repo.id, repo]));
    const removedIds = old.filter(repo => !eligible.has(Number(repo.github_repo_id))).map(repo => Number(repo.github_repo_id));
    const selectedIds = requestedIds ?? old.map(repo => Number(repo.github_repo_id)).filter(id => eligible.has(id));
    await client.query(`DELETE FROM public.repository WHERE user_id = $1 AND NOT (github_repo_id = ANY($2::bigint[]))`, [userId, selectedIds]);
    for (const [index, id] of selectedIds.entries()) {
      const repo = eligible.get(id);
      if (!repo) throw new GithubRepositoryError(422, "INVALID_REPOSITORY", "Selecciona únicamente repositorios públicos de tu cuenta.");
      await upsertSnapshot(client, userId, repo, index);
    }
    const { rows: saved } = await client.query<SavedRepository>(`SELECT * FROM public.repository WHERE user_id = $1 ORDER BY display_order`, [userId]);
    return { saved, removedIds };
  });
}

/** Vista pública: SQL local, sin llamadas a GitHub ni tokens en la respuesta. */
export async function findPublicRepositories(userId: string) {
  return processReturnQuery(`SELECT r.name, r.description, r.language, r.stars, r.url, r.visible
    FROM public.repository r
    WHERE r.user_id = $1 AND r.visible = TRUE AND r.github_visibility = 'public'
      AND EXISTS (SELECT 1 FROM public.external_account a WHERE a.user_id = r.user_id
        AND a.provider = 'github' AND a.state = 'active'
        AND LOWER(r.url) LIKE 'https://github.com/' || LOWER(a.provider_username) || '/%'
        AND (a.access_expires_at IS NULL OR a.access_expires_at > NOW()))
    ORDER BY r.display_order`, [userId]);
}
