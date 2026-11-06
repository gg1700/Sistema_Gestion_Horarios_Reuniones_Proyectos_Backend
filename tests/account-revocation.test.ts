import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env.config";
import { revokeExternalAccounts } from "../src/services/account-revocation.service";
import { encryptToken } from "../src/utils/token";
import type { ExternalAccountForRevocation } from "../src/types/account-deletion.types";

const previousKey = env.ENCRYPTION_KEY;
let accounts: ExternalAccountForRevocation[];

beforeEach(() => {
  env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  accounts = [
    { provider: "google", access_token: encryptToken("google-access-secret"), refresh_token: encryptToken("google-refresh-secret") },
    { provider: "github", access_token: encryptToken("github-access-secret"), refresh_token: null },
  ];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  env.ENCRYPTION_KEY = previousKey;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("T-21: revocacion de proveedores", () => {
  it("decrypts every account and calls each provider with the required request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await revokeExternalAccounts(accounts);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [googleUrl, googleOptions] = fetchMock.mock.calls[0];
    expect(googleUrl).toBe("https://oauth2.googleapis.com/revoke");
    expect(googleOptions.body.toString()).toBe("token=google-refresh-secret");
    expect(googleOptions.signal).toBeInstanceOf(AbortSignal);
    const [githubUrl, githubOptions] = fetchMock.mock.calls[1];
    expect(githubUrl).toBe(`https://api.github.com/applications/${encodeURIComponent(env.GITHUB_CLIENT_ID)}/grant`);
    expect(githubOptions.method).toBe("DELETE");
    expect(JSON.parse(githubOptions.body)).toEqual({ access_token: "github-access-secret" });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([400, 401, 404, 500, 503])("continues with the next provider after HTTP %i", async status => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(revokeExternalAccounts(accounts)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), { provider: "google", status });
  });

  it("continues after a timeout without logging credentials or raw provider errors", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("timeout google-access-secret private-secret"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await revokeExternalAccounts(accounts);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/secret|token|v1:/);
  });

  it("uses the Google access token when no refresh token is saved", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await revokeExternalAccounts([{ ...accounts[0], refresh_token: null }]);
    expect(fetchMock.mock.calls[0][1].body.toString()).toBe("token=google-access-secret");
  });

  it("logs a decryption failure and still processes the remaining accounts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await revokeExternalAccounts([{ ...accounts[0], access_token: "plaintext-secret", refresh_token: null }, accounts[1]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("plaintext-secret");
  });

  it("bounds a stalled request and moves to the next account", async () => {
    vi.useFakeTimers();
    // AbortSignal.timeout uses native timers; inject a signal driven by fake timers.
    vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    const fetchMock = vi.fn()
      .mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const pending = revokeExternalAccounts(accounts);
      await vi.advanceTimersByTimeAsync(5000);
      await pending;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not require an encryption key when there are no linked accounts", async () => {
    env.ENCRYPTION_KEY = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await revokeExternalAccounts([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
