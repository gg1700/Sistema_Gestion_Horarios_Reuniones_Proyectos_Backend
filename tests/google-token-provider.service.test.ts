import { afterEach, describe, expect, it, vi } from "vitest";
import {
  refreshGoogleAccessToken
} from "../src/services/google-token-provider.service";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Google OAuth token refresh provider", () => {
  it("exchanges a refresh token for a new access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        access_token: "new-access",
        expires_in: 3600,
        token_type: "Bearer"
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await refreshGoogleAccessToken("valid-refresh");

    expect(result.accessToken).toBe("new-access");
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(options.method).toBe("POST");
    expect(options.body.get("grant_type")).toBe("refresh_token");
    expect(options.body.get("refresh_token")).toBe("valid-refresh");
  });

  it("detects an invalid or revoked refresh token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      response({ error: "invalid_grant" }, 400)
    ));

    await expect(refreshGoogleAccessToken("revoked-refresh"))
      .rejects.toMatchObject({ code: "refresh_revoked" });
  });

  it("handles temporary Google errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      response({ error: "server_error" }, 503)
    ));

    await expect(refreshGoogleAccessToken("valid-refresh"))
      .rejects.toMatchObject({ code: "refresh_failed" });
  });

  it("rejects an incomplete successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      response({ token_type: "Bearer" })
    ));

    await expect(refreshGoogleAccessToken("valid-refresh"))
      .rejects.toMatchObject({ code: "refresh_failed" });
  });
});
