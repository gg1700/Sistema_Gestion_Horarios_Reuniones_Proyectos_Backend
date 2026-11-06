import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), encryptToken: vi.fn((value: string) => `encrypted:${value}`) }));
vi.mock("../src/config/database.config", () => ({ default: { query: mocks.query } }));
vi.mock("../src/utils/token", () => ({ encryptToken: mocks.encryptToken }));

import { saveExternalAccount } from "../src/repositories/oauth-callback.repository";
import type { OAuthLinkedAccount } from "../src/types/oauth-callback.types";

const account: OAuthLinkedAccount = {
  userId: "test-user-id",
  provider: "google",
  profile: { id: "provider-user-id", username: "test", name: "Test", email: "test@example.com", avatarUrl: null, profileUrl: null },
  tokens: { accessToken: "plain-access", refreshToken: "plain-refresh", expiresAt: null, scopes: "email profile" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rowCount: 1, rows: [{ id: "linked-account-id" }] });
});

describe("OAuth callback repository", () => {
  it("encrypts both tokens before saving", async () => {
    await saveExternalAccount(account);
    expect(mocks.encryptToken).toHaveBeenCalledWith("plain-access");
    expect(mocks.encryptToken).toHaveBeenCalledWith("plain-refresh");
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ON CONFLICT (user_id, provider)");
    expect(sql).toContain("COALESCE(EXCLUDED.refresh_token");
    expect(params[5]).toBe("encrypted:plain-access");
    expect(params[6]).toBe("encrypted:plain-refresh");
    expect(params).not.toContain("plain-access");
    expect(params).not.toContain("plain-refresh");
  });

  it("accepts an absent refresh token", async () => {
    await saveExternalAccount({ ...account, tokens: { ...account.tokens, refreshToken: null } });
    const [, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(params[6]).toBeNull();
    expect(mocks.encryptToken).toHaveBeenCalledTimes(1);
  });

  it("does not silently replace a different provider identity", async () => {
    mocks.query.mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(saveExternalAccount(account)).rejects.toMatchObject({ name: "ConflictError", statusCode: 409 });
  });

  it("propagates database errors instead of claiming success", async () => {
    mocks.query.mockRejectedValue(Object.assign(new Error("unique violation"), { code: "23505" }));
    await expect(saveExternalAccount(account)).rejects.toMatchObject({ code: "23505" });
  });
});
