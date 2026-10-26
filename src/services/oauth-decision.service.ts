
import { resolveAccount } from "../repositories/oauth-decision.repository";
import { createSession } from "./session.service";
import type { OAuthProvider } from "../types/oauth.types";
import type { OAuthProviderProfile, OAuthTokens } from "../types/oauth-callback.types";

interface OAuthDecisionInput {
  provider: OAuthProvider;
  profile: OAuthProviderProfile;
  tokens: OAuthTokens;
  userId: string | null;
}

function normalizeHandle(value: string): string {
  const result = value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  return result.length >= 3 ? result : `user-${result || "oauth"}`;
}

function splitName(fullName: string | null) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);

  return {
    name: parts[0]?.slice(0, 100) || "Usuario",
    firstSurname: parts.slice(1).join(" ").slice(0, 100) || "Pendiente",
  };
}

export async function resolveOAuthIdentity(input: OAuthDecisionInput) {
  const email = input.profile.email?.trim().toLowerCase() ?? null;
  const profile = { ...input.profile, email };
  const { name, firstSurname } = splitName(profile.name);
  const handleBase = normalizeHandle(profile.username ?? profile.name ?? `${input.provider}-${profile.id}`);

  const user = await resolveAccount({
    ...input,
    profile,
    name,
    firstSurname,
    handleBase,
  });

  return {
    user,
    session: createSession(user.id, user.handle_name),
  };
}
