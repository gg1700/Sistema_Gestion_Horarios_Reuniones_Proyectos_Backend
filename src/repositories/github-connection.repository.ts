import { processReturnQuery } from "../utils/query";

export interface GitHubAccountRow {
  id: string; provider_user_id: string; provider_username: string | null;
  access_token: string; access_expires_at: Date | null; state: string; scopes: string | null;
}
export async function findGitHubAccount(userId: string): Promise<GitHubAccountRow | null> {
  const rows = await processReturnQuery(
    `SELECT ea.id, ea.provider_user_id, ea.provider_username, ea.access_token,
      ea.access_expires_at, ea.state, ea.scopes
     FROM public.external_account ea JOIN public."user" u ON u.id = ea.user_id
     WHERE ea.user_id = $1 AND ea.provider = 'github' AND u.deleted_at IS NULL AND u.status = 'active'`, [userId]
  );
  return (rows[0] as GitHubAccountRow | undefined) ?? null;
}
export async function markGitHubExpired(account: GitHubAccountRow) {
  await processReturnQuery(
    `UPDATE public.external_account SET state = 'expired', updated_at = NOW()
     WHERE id = $1 AND access_token = $2 RETURNING id`, [account.id, account.access_token]
  );
}
export async function updateGitHubMetadata(account: GitHubAccountRow, username: string, scopes: string[]) {
  await processReturnQuery(
    `UPDATE public.external_account SET provider_username = $2, scopes = $3, updated_at = NOW()
     WHERE id = $1 AND access_token = $4 RETURNING id`, [account.id, username, scopes.join(" "), account.access_token]
  );
}

