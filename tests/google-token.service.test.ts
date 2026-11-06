import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processTransaction: vi.fn(),
  decryptToken: vi.fn(),
  findAccount: vi.fn(),
  updateToken: vi.fn(),
  markReconnection: vi.fn(),
  refreshToken: vi.fn()
}));

vi.mock("../src/utils/query", () => ({
  processTransaction: mocks.processTransaction
}));

vi.mock("../src/utils/token", () => ({
  decryptToken: mocks.decryptToken
}));

vi.mock("../src/repositories/google-token.repository", () => ({
  findGoogleAccountForUpdate: mocks.findAccount,
  updateGoogleAccessToken: mocks.updateToken,
  markGoogleReconnectionRequired: mocks.markReconnection
}));

vi.mock("../src/services/google-token-provider.service", () => ({
  refreshGoogleAccessToken: mocks.refreshToken,
  GoogleTokenRefreshError: class GoogleTokenRefreshError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  }
}));

import {
  getValidGoogleAccessToken
} from "../src/services/google-token.service";

import {
  GoogleTokenRefreshError
} from "../src/services/google-token-provider.service";

const userId = "user-123";
const client = {} as never;

function account(expiresAt: Date | null, overrides = {}) {
  return {
    id: "account-123",
    user_id: userId,
    access_token: "encrypted-access",
    refresh_token: "encrypted-refresh",
    access_expires_at: expiresAt,
    state: "active",
    ...overrides
  };
}

beforeEach(() => {
  vi.resetAllMocks();

  mocks.processTransaction.mockImplementation(async (callback) =>
    callback(client)
  );

  mocks.decryptToken.mockImplementation((value: string) => {
    if (value === "encrypted-access") return "valid-access";
    if (value === "encrypted-refresh") return "valid-refresh";
    return value;
  });

  mocks.updateToken.mockResolvedValue(undefined);
  mocks.markReconnection.mockResolvedValue(undefined);
});

describe("Google access token service", () => {
  it("returns a valid token without refreshing it", async () => {
    mocks.findAccount.mockResolvedValue(
      account(new Date(Date.now() + 60 * 60 * 1000))
    );

    const token = await getValidGoogleAccessToken(userId);

    expect(token).toBe("valid-access");
    expect(mocks.refreshToken).not.toHaveBeenCalled();
    expect(mocks.updateToken).not.toHaveBeenCalled();
  });

  it("refreshes a token that is about to expire", async () => {
    mocks.findAccount.mockResolvedValue(
      account(new Date(Date.now() + 2 * 60 * 1000))
    );

    const refreshed = {
      accessToken: "new-access",
      expiresAt: new Date(Date.now() + 3600_000)
    };

    mocks.refreshToken.mockResolvedValue(refreshed);

    const token = await getValidGoogleAccessToken(userId);

    expect(token).toBe("new-access");
    expect(mocks.refreshToken).toHaveBeenCalledWith("valid-refresh");
    expect(mocks.updateToken).toHaveBeenCalledWith(
      client,
      "account-123",
      refreshed
    );
  });

  it("refreshes an expired token successfully", async () => {
    mocks.findAccount.mockResolvedValue(
      account(new Date(Date.now() - 60_000))
    );

    mocks.refreshToken.mockResolvedValue({
      accessToken: "renewed-access",
      expiresAt: new Date(Date.now() + 3600_000)
    });

    const token = await getValidGoogleAccessToken(userId);

    expect(token).toBe("renewed-access");
    expect(mocks.refreshToken).toHaveBeenCalledOnce();
    expect(mocks.updateToken).toHaveBeenCalledOnce();
    expect(mocks.markReconnection).not.toHaveBeenCalled();
  });

  it("marks the connection when the refresh token is revoked", async () => {
    mocks.findAccount.mockResolvedValue(
      account(new Date(Date.now() - 60_000))
    );

    mocks.refreshToken.mockRejectedValue(
      new GoogleTokenRefreshError("refresh_revoked")
    );

    await expect(getValidGoogleAccessToken(userId))
      .rejects.toMatchObject({
        code: "reconnection_required"
      });

    expect(mocks.markReconnection).toHaveBeenCalledWith(
      client,
      "account-123"
    );
    expect(mocks.updateToken).not.toHaveBeenCalled();
  });

  it("requires reconnection when the refresh token is missing", async () => {
    mocks.findAccount.mockResolvedValue(
      account(new Date(Date.now() - 60_000), {
        refresh_token: null
      })
    );

    await expect(getValidGoogleAccessToken(userId))
      .rejects.toMatchObject({
        code: "reconnection_required"
      });

    expect(mocks.markReconnection).toHaveBeenCalledOnce();
    expect(mocks.refreshToken).not.toHaveBeenCalled();
  });

  it("does not revoke credentials on a temporary Google error", async () => {
    mocks.findAccount.mockResolvedValue(
      account(new Date(Date.now() - 60_000))
    );

    mocks.refreshToken.mockRejectedValue(
      new GoogleTokenRefreshError("refresh_failed")
    );

    await expect(getValidGoogleAccessToken(userId))
      .rejects.toMatchObject({
        code: "refresh_failed"
      });

    expect(mocks.markReconnection).not.toHaveBeenCalled();
    expect(mocks.updateToken).not.toHaveBeenCalled();
  });

  it("rejects users without a Google account", async () => {
    mocks.findAccount.mockResolvedValue(null);

    await expect(getValidGoogleAccessToken(userId))
      .rejects.toMatchObject({
        code: "google_not_connected"
      });

    expect(mocks.refreshToken).not.toHaveBeenCalled();
  });

  it("rejects accounts already marked as revoked", async () => {
    mocks.findAccount.mockResolvedValue(
      account(new Date(Date.now() + 3600_000), {
        state: "revoked"
      })
    );

    await expect(getValidGoogleAccessToken(userId))
      .rejects.toMatchObject({
        code: "reconnection_required"
      });

    expect(mocks.refreshToken).not.toHaveBeenCalled();
  });
});
