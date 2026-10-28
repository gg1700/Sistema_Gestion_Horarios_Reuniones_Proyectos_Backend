import { describe, expect, it, vi } from "vitest";
import { GitHubClient } from "../src/integrations/github/github.client";

const json = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
describe("GitHub shared client", () => {
  it("sends the token only to GitHub and preserves pagination headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(json([], 200, { link: '<https://api.github.com/user/repos?page=2>; rel="next"' }));
    const result = await new GitHubClient("private-token", fetcher).get("/user/repos");
    expect(result.headers.get("link")).toContain('rel="next"');
    expect(fetcher.mock.calls[0][0]).toBe("https://api.github.com/user/repos");
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer private-token");
  });
  it("never sends Authorization to an external pagination URL", async () => {
    const fetcher = vi.fn();
    await expect(new GitHubClient("secret", fetcher).get("https://other.test/next")).rejects.toMatchObject({ code: "GITHUB_INVALID_URL" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects a redirect to another host without forwarding the token", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://other.test" } }));
    await expect(new GitHubClient("secret", fetcher).get("/user")).rejects.toMatchObject({ code: "GITHUB_INVALID_URL" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("distinguishes revoked tokens from insufficient permissions", async () => {
    await expect(new GitHubClient("secret", vi.fn().mockResolvedValue(json({}, 401))).get("/user")).rejects.toMatchObject({ statusCode: 409, code: "GITHUB_REAUTH_REQUIRED" });
    await expect(new GitHubClient("secret", vi.fn().mockResolvedValue(json({}, 403))).get("/user")).rejects.toMatchObject({ statusCode: 403, code: "GITHUB_PERMISSION_REQUIRED" });
  });
  it("reports rate limiting without retrying in a loop", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({}, 403, { "x-ratelimit-remaining": "0", "retry-after": "42" }));
    await expect(new GitHubClient("secret", fetcher).get("/user")).rejects.toMatchObject({ statusCode: 429, retryAfterSeconds: 42 });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("does not expose provider errors or credentials", async () => {
    await expect(new GitHubClient("secret", vi.fn().mockRejectedValue(new Error("secret"))).get("/user")).rejects.toThrow("No se pudo contactar con GitHub.");
    await expect(new GitHubClient("secret", vi.fn().mockResolvedValue(new Response("not JSON"))).get("/user")).rejects.toMatchObject({ code: "GITHUB_INVALID_RESPONSE" });
  });
});

