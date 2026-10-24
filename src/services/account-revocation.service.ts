import { env } from "../config/env.config";
import type { ExternalAccountForRevocation } from "../types/account-deletion.types";
import { decryptToken } from "../utils/token";

async function revokeAccount(account: ExternalAccountForRevocation): Promise<number> {
  const signal = AbortSignal.timeout(5000);
  let response: Response;
  if (account.provider === "google") {
    const token = decryptToken(account.refresh_token || account.access_token);
    response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal,
      redirect: "error",
    });
  } else if (account.provider === "github") {
    const token = decryptToken(account.access_token);
    const credentials = Buffer.from(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`).toString("base64");
    response = await fetch(`https://api.github.com/applications/${encodeURIComponent(env.GITHUB_CLIENT_ID)}/grant`, {
      method: "DELETE",
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "telematics-backend",
      },
      body: JSON.stringify({ access_token: token }),
      signal,
      redirect: "error",
    });
  } else {
    throw new Error("unsupported_provider");
  }
  await response.body?.cancel();
  return response.status;
}

export async function revokeExternalAccounts(accounts: ExternalAccountForRevocation[]): Promise<void> {
  for (const account of accounts) {
    const provider = ["google", "github"].includes(account.provider) ? account.provider : "unknown";
    try {
      const status = await revokeAccount(account);
      if (status < 200 || status >= 300) {
        console.warn("No se pudo revocar el acceso externo; se continuara la eliminacion", { provider, status });
      }
    } catch {
      console.warn("No se pudo revocar el acceso externo; se continuara la eliminacion", { provider });
    }
  }
}
