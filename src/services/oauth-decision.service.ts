import { resolveAccount } from "../repositories/oauth-decision.repository";
import { createSession } from "./session.service";
import { validateEmail, validateProperNoun } from "../validators/general.validator";
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
  const rawName = parts[0] || "Usuario";
  const rawSurname = parts.slice(1).join(" ") || "Pendiente";

  const normalizeName = (value: string, fallback: string, field: string) => {
    const normalized = value.replace(/[^\p{L}\p{M}\s'-]/gu, "").trim().slice(0, 100);
    return validateProperNoun(normalized || fallback, field);
  };

  return {
    name: normalizeName(rawName, "Usuario", "Nombre"),
    firstSurname: normalizeName(rawSurname, "Pendiente", "Primer Apellido"),
  };
}
export async function resolveOAuthIdentity(input: OAuthDecisionInput) {
  const email = input.profile.email
    ? validateEmail(input.profile.email, "Correo electronico")
    : null;

  const profile = { ...input.profile, email };
  const { name, firstSurname } = splitName(profile.name);

  const handleSource = input.provider === "google"
    ? profile.name ?? profile.email ?? `google-${profile.id}`
    : profile.username ?? profile.name ?? `github-${profile.id}`;

  const handleBase = normalizeHandle(handleSource);

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
