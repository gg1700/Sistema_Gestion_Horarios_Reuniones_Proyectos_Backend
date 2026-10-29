import { processTransaction } from "../utils/query";
import { decryptToken } from "../utils/token";
import {
  findGoogleAccountForUpdate,
  updateGoogleAccessToken,
  markGoogleReconnectionRequired
} from "../repositories/google-token.repository";
import {
  refreshGoogleAccessToken,
  GoogleTokenRefreshError
} from "./google-token-provider.service";

const EXPIRATION_MARGIN_MS = 5 * 60 * 1000;
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.";

export class GoogleTokenError extends Error {
  constructor(
    public readonly code:
      | "google_not_connected"
      | "reconnection_required"
      | "google_refresh_failed"
  ) {
    super(code);
    this.name = "GoogleTokenError";
  }
}

export async function getValidGoogleAccessToken(
  userId: string
): Promise<string> {
  const result = await processTransaction(async (client) => {
    const account = await findGoogleAccountForUpdate(client, userId);

    if (!account) {
      throw new GoogleTokenError("google_not_connected");
    }

    if (account.state !== "active") {
      throw new GoogleTokenError("reconnection_required");
    }

    const expiresAt = account.access_expires_at
      ? new Date(account.access_expires_at).getTime()
      : 0;

    if (expiresAt > Date.now() + EXPIRATION_MARGIN_MS) {
      return {
        accessToken: decryptToken(account.access_token),
        reconnect: false
      };
    }

    if (!account.refresh_token) {
      await markGoogleReconnectionRequired(client, account.id);

      return {
        accessToken: null,
        reconnect: true
      };
    }

    try {
      const refreshed = await refreshGoogleAccessToken(
        decryptToken(account.refresh_token)
      );

      await updateGoogleAccessToken(client, account.id, refreshed);

      return {
        accessToken: refreshed.accessToken,
        reconnect: false
      };
    } catch (error) {
      if (
        error instanceof GoogleTokenRefreshError &&
        error.code === "refresh_revoked"
      ) {
        await markGoogleReconnectionRequired(client, account.id);

        return {
          accessToken: null,
          reconnect: true
        };
      }

      throw error;
    }
  });

  if (result.reconnect || !result.accessToken) {
    throw new GoogleTokenError("reconnection_required");
  }

  return result.accessToken;
}
