import { processReturnQuery } from "../utils/query";
import type { LinkedIdentity, SessionProfile } from "../types/auth-session.types";

export function normalizeScopes(value: string | null): string[] {
  return [...new Set((value ?? "").split(/[,\s]+/).filter(Boolean))];
}

export async function findSessionProfile(userId: string): Promise<SessionProfile | null> {
  const [row] = await processReturnQuery(
    `SELECT id, handle_name, name, first_surname, email, profile_picture
     FROM public."user" WHERE id = $1 AND deleted_at IS NULL AND status = 'active'`, [userId]
  );
  if (!row) return null;
  return {
    id: row.id, handleName: row.handle_name, name: row.name,
    firstSurname: row.first_surname, email: row.email, profilePicture: row.profile_picture,
    requiresProfileCompletion: !row.name || !row.first_surname || row.name === "Usuario" || row.first_surname === "Pendiente",
  };
}

export async function findLinkedIdentities(userId: string): Promise<LinkedIdentity[]> {
  const rows = await processReturnQuery(
    `SELECT provider, provider_username, provider_user_email, state, scopes
     FROM public.external_account WHERE user_id = $1 AND provider IN ('google', 'github')
     ORDER BY provider`, [userId]
  );
  return rows.map(row => ({
    provider: row.provider, username: row.provider_username, email: row.provider_user_email,
    state: row.state, scopes: normalizeScopes(row.scopes),
  }));
}

export async function updateSessionProfile(userId: string, value: { name: string; firstSurname: string; handleName: string }) {
  const rows = await processReturnQuery(
    `UPDATE public."user" SET name = $2, first_surname = $3, handle_name = $4, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL AND status = 'active' RETURNING id`,
    [userId, value.name, value.firstSurname, value.handleName]
  );
  return rows.length === 1;
}

