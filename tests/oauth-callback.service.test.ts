
import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeCode, getProviderProfile } from "../src/services/oauth-callback.service";
import { OAuthCallbackError } from "../src/types/oauth-callback.types";

function mockResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OAuth callback service", () => {
  it("exchanges a Google authorization code for tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({
      access_token: "google-access-token",
      refresh_token: "google-refresh-token",
      expires_in: 3600,
      scope: "openid email profile",
    }));

    vi.stubGlobal("fetch", fetchMock);

    const tokens = await exchangeCode("google", "valid-code", "valid-verifier");

    expect(tokens.accessToken).toBe("google-access-token");
    expect(tokens.refreshToken).toBe("google-refresh-token");
    expect(tokens.expiresAt).toBeInstanceOf(Date);
    expect(tokens.scopes).toBe("openid email profile");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("exchanges a GitHub authorization code without requiring a refresh token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({
      access_token: "github-access-token",
      scope: "read:user,user:email",
    })));

    const tokens = await exchangeCode("github", "valid-code", "valid-verifier");

    expect(tokens.accessToken).toBe("github-access-token");
    expect(tokens.refreshToken).toBeNull();
    expect(tokens.expiresAt).toBeNull();
  });

  it("retrieves a verified Google profile", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({
      sub: "google-user-123",
      name: "Usuario Google",
      email: "usuario@gmail.com",
      email_verified: true,
      picture: "https://example.com/avatar.png",
    })));

    const profile = await getProviderProfile("google", "google-access-token");

    expect(profile.id).toBe("google-user-123");
    expect(profile.name).toBe("Usuario Google");
    expect(profile.email).toBe("usuario@gmail.com");
  });

  it("retrieves a GitHub profile and its verified primary email", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockResponse({
        id: 12345,
        login: "github-user",
        name: "Usuario GitHub",
        avatar_url: "https://example.com/avatar.png",
        html_url: "https://github.com/github-user",
      }))
      .mockResolvedValueOnce(mockResponse([
        { email: "secondary@example.com", primary: false, verified: true },
        { email: "primary@example.com", primary: true, verified: true },
      ]));

    vi.stubGlobal("fetch", fetchMock);

    const profile = await getProviderProfile("github", "github-access-token");

    expect(profile.id).toBe("12345");
    expect(profile.username).toBe("github-user");
    expect(profile.email).toBe("primary@example.com");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("continues when GitHub email lookup fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockResponse({ id: 12345, login: "github-user" }))
      .mockRejectedValueOnce(new Error("Network error"));

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const profile = await getProviderProfile("github", "github-access-token");

    expect(profile.id).toBe("12345");
    expect(profile.email).toBeNull();
  });

  it("rejects an invalid authorization code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({
      error: "bad_verification_code",
    }, 401)));

    await expect(exchangeCode("github", "invalid-code", "verifier"))
      .rejects.toMatchObject({ code: "invalid_code" });
  });

  it("rejects unavailable OAuth providers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({}, 503)));

    await expect(exchangeCode("google", "code", "verifier"))
      .rejects.toBeInstanceOf(OAuthCallbackError);

    await expect(exchangeCode("google", "code", "verifier"))
      .rejects.toMatchObject({ code: "provider_unavailable" });
  });
});
