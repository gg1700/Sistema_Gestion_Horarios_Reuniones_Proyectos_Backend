import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findGitHubAccount: vi.fn(), markGitHubExpired: vi.fn(), updateGitHubMetadata: vi.fn(), decryptToken: vi.fn(),
}));
vi.mock("../src/repositories/github-connection.repository", () => mocks);
vi.mock("../src/utils/token", () => ({ decryptToken: mocks.decryptToken }));
import { verifyGitHubConnection } from "../src/services/github-connection.service";

const account = { id: "account-1", provider_user_id: "123", provider_username: "old-name",
  access_token: "encrypted-only", access_expires_at: null, state: "active", scopes: "read:user,user:email" };
beforeEach(() => {
  vi.resetAllMocks(); mocks.findGitHubAccount.mockResolvedValue(account); mocks.decryptToken.mockReturnValue("plain-server-only");
});
afterEach(() => vi.unstubAllGlobals());
describe("GitHub connection verification", () => {
  it("requires a GitHub identity even when the user has Google", async () => {
    mocks.findGitHubAccount.mockResolvedValue(null);
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(verifyGitHubConnection("google-user")).rejects.toMatchObject({ code: "GITHUB_NOT_CONNECTED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("verifies the linked provider id and uses the granted scopes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 123, login: "new-name" }), { headers: { "x-oauth-scopes": "read:user, repo" } })));
    const result = await verifyGitHubConnection("owner");
    expect(result.username).toBe("new-name");
    expect(result.permissions.canReadPrivateRepositories).toBe(true);
    expect(mocks.updateGitHubMetadata).toHaveBeenCalledWith(account, "new-name", ["read:user", "repo"]);
    expect(JSON.stringify(result)).not.toContain("plain-server-only");
    expect(JSON.stringify(result)).not.toContain("encrypted-only");
  });
  it("does not grant private access without the repo scope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 123, login: "name" }), { headers: { "x-oauth-scopes": "read:user,user:email" } })));
    expect((await verifyGitHubConnection("owner")).permissions.canReadPrivateRepositories).toBe(false);
  });
  it("rejects a token for a different GitHub account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 999, login: "other" }))));
    await expect(verifyGitHubConnection("owner")).rejects.toMatchObject({ code: "GITHUB_REAUTH_REQUIRED" });
    expect(mocks.markGitHubExpired).toHaveBeenCalledWith(account);
    expect(mocks.updateGitHubMetadata).not.toHaveBeenCalled();
  });
  it("marks a rejected token for reauthorization", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(verifyGitHubConnection("owner")).rejects.toMatchObject({ code: "GITHUB_REAUTH_REQUIRED" });
    expect(mocks.markGitHubExpired).toHaveBeenCalledOnce();
  });
  it("keeps the identity during rate limits or provider outages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 429 })));
    await expect(verifyGitHubConnection("owner")).rejects.toMatchObject({ code: "GITHUB_RATE_LIMITED" });
    expect(mocks.markGitHubExpired).not.toHaveBeenCalled();
  });
  it("does not send expired or unreadable tokens to the provider", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    mocks.findGitHubAccount.mockResolvedValue({ ...account, access_expires_at: new Date(0) });
    await expect(verifyGitHubConnection("owner")).rejects.toMatchObject({ code: "GITHUB_REAUTH_REQUIRED" });
    mocks.findGitHubAccount.mockResolvedValue(account); mocks.decryptToken.mockImplementation(() => { throw new Error("bad key"); });
    await expect(verifyGitHubConnection("owner")).rejects.toMatchObject({ code: "GITHUB_REAUTH_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

