
import type { PoolClient } from "pg";
import { processTransaction } from "../utils/query";
import { encryptToken } from "../utils/token";
import { ConflictError } from "../helpers/errors.helper";
import type { OAuthProvider } from "../types/oauth.types";
import type { OAuthProviderProfile, OAuthTokens } from "../types/oauth-callback.types";
import { validatePublicHandle } from "../helpers/publicLink.helper";
export interface OAuthUser {
  id: string;
  handle_name: string;
}

interface OAuthDecisionInput {
  provider: OAuthProvider;
  profile: OAuthProviderProfile;
  tokens: OAuthTokens;
  userId: string | null;
  name: string;
  firstSurname: string;
  handleBase: string;
}

async function findAccount(client: PoolClient, provider: OAuthProvider, providerId: string) {
  const { rows } = await client.query<OAuthUser>(
    `SELECT u.id, u.handle_name
     FROM public.external_account ea
     JOIN public."user" u ON u.id = ea.user_id
     WHERE ea.provider = $1 AND ea.provider_user_id = $2
       AND u.deleted_at IS NULL AND u.status = 'active'
     FOR UPDATE OF ea`,
    [provider, providerId]
  );
  return rows[0] ?? null;
}

async function findUser(client: PoolClient, userId: string) {
  const { rows } = await client.query<OAuthUser>(
    `SELECT id, handle_name FROM public."user"
     WHERE id = $1 AND deleted_at IS NULL AND status = 'active'`,
    [userId]
  );
  return rows[0] ?? null;
}


async function createUser(client: PoolClient, input: OAuthDecisionInput): Promise<OAuthUser> {
  const email = input.profile.email;
  if (!email) throw new ConflictError("additional_info_required");

  const { rows: existing } = await client.query(
    `SELECT id FROM public."user" WHERE LOWER(email) = $1`,
    [email]
  );

  if (existing.length) throw new ConflictError("email_conflict");

  for (let i = 0; i < 1000; i++) {
    const suffix = i === 0 ? "" : `-${i}`;
    const handle = `${input.handleBase.slice(0, 50 - suffix.length)}${suffix}`;

    if (!validatePublicHandle(handle).valid) continue;

    const { rows } = await client.query<OAuthUser>(
      `INSERT INTO public."user" (handle_name, name, first_surname, email, profile_picture)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING id, handle_name`,
      [handle, input.name, input.firstSurname, email, input.profile.avatarUrl]
    );

    if (rows[0]) return rows[0];

    const { rows: emailConflict } = await client.query(
      `SELECT id FROM public."user" WHERE LOWER(email) = $1`,
      [email]
    );

    if (emailConflict.length) throw new ConflictError("email_conflict");
  }

  throw new ConflictError("handle_unavailable");
}

async function saveAccount(client: PoolClient, userId: string, input: OAuthDecisionInput) {
  const { provider, profile, tokens } = input;

  const result = await client.query(
    `INSERT INTO public.external_account (
       user_id, provider, provider_user_id, provider_username,
       provider_user_email, access_token, refresh_token,
       access_expires_at, scopes, state
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
     ON CONFLICT (user_id, provider)
     DO UPDATE SET
       provider_username = EXCLUDED.provider_username,
       provider_user_email = EXCLUDED.provider_user_email,
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, public.external_account.refresh_token),
       access_expires_at = EXCLUDED.access_expires_at,
       scopes = EXCLUDED.scopes,
       state = 'active',
       updated_at = NOW()
     WHERE public.external_account.provider_user_id = EXCLUDED.provider_user_id
     RETURNING id`,
    [
      userId, provider, profile.id, profile.username, profile.email,
      encryptToken(tokens.accessToken),
      tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      tokens.expiresAt, tokens.scopes,
    ]
  );

  if (!result.rowCount) throw new ConflictError("account_conflict");
}

async function saveInitialDetails(client: PoolClient, userId: string, input: OAuthDecisionInput) {
  if (input.profile.email) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO public.email (address) VALUES ($1)
       ON CONFLICT (address) DO UPDATE SET address = EXCLUDED.address
       RETURNING id`,
      [input.profile.email]
    );

    await client.query(
      `INSERT INTO public.user_email (user_id, email_id, visible)
       VALUES ($1, $2, false)`,
      [userId, rows[0].id]
    );
  }

  if (input.provider === "github" && input.profile.profileUrl) {
    await client.query(
      `INSERT INTO public.link (user_id, text, url, visible)
       VALUES ($1, 'GitHub', $2, false)`,
      [userId, input.profile.profileUrl]
    );
  }
}

export async function resolveAccount(input: OAuthDecisionInput): Promise<OAuthUser> {
  try {
    return await processTransaction(async client => {
      const linked = await findAccount(client, input.provider, input.profile.id);

      if (linked) {
        if (input.userId && linked.id !== input.userId) throw new ConflictError("account_conflict");
        await saveAccount(client, linked.id, input);
        return linked;
      }

      const user = input.userId ? await findUser(client, input.userId) : await createUser(client, input);
      if (!user) throw new ConflictError("invalid_session");

      const isNewUser = !input.userId;
      await saveAccount(client, user.id, input);
      if (isNewUser) await saveInitialDetails(client, user.id, input);
      return user;
    });
    } catch (error) {
      const dbError = error as { code?: string; constraint?: string; table?: string };

      if (dbError.code === "23505") {
        console.error("OAuth unique constraint conflict:", {
          table: dbError.table,
          constraint: dbError.constraint,
          code: dbError.code,
        });
        throw new ConflictError("account_conflict");
      }

      throw error;
    }
}
