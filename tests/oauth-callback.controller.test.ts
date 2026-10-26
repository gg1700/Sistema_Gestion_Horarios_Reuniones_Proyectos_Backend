
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { ConflictError } from "../src/helpers/errors.helper";
import { OAuthCallbackError } from "../src/types/oauth-callback.types";

const mocks = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  getProviderProfile: vi.fn(),
  resolveOAuthIdentity: vi.fn(),
}));

vi.mock("../src/services/oauth-callback.service", () => ({
  exchangeCode: mocks.exchangeCode,
  getProviderProfile: mocks.getProviderProfile,
}));

vi.mock("../src/services/oauth-decision.service", () => ({
  resolveOAuthIdentity: mocks.resolveOAuthIdentity,
}));

import { oauthCallback } from "../src/controllers/oauth-callback.controller";

const flow = {
  provider: "google",
  state: "test-state",
  codeVerifier: "test-verifier",
  userId: null as string | null,
  issuedAt: Date.now(),
};

const tokens = {
  accessToken: "test-access-token",
  refreshToken: null,
  expiresAt: null,
  scopes: "openid email",
};

const profile = {
  id: "google-123",
  username: "user@gmail.com",
  name: "Test",
  email: "user@gmail.com",
  avatarUrl: null,
  profileUrl: null,
};

function makeContext(options: {
  provider?: string;
  query?: Record<string, unknown>;
  cookie?: unknown;
} = {}) {
  const req = {
    params: { provider: options.provider ?? "google" },
    query: options.query ?? { state: flow.state, code: "valid-code" },
    signedCookies: {
      oauth_flow: options.cookie === undefined ? JSON.stringify(flow) : options.cookie,
    },
  } as unknown as Request;

  const res = {
    set: vi.fn(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    redirect: vi.fn(),
  } as unknown as Response;

  return { req, res };
}

function expectRedirect(res: Response, status: string) {
  expect(res.redirect).toHaveBeenCalledOnce();

  const [httpStatus, destination] = vi.mocked(res.redirect).mock.calls[0] as [number, string];

  expect(httpStatus).toBe(302);
  expect(new URL(destination).searchParams.get("oauth")).toBe(status);
  expect(res.clearCookie).toHaveBeenCalledWith(
    "oauth_flow",
    expect.objectContaining({ path: "/api/v1/auth" })
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  flow.issuedAt = Date.now();
  flow.userId = null;

  mocks.exchangeCode.mockResolvedValue(tokens);
  mocks.getProviderProfile.mockResolvedValue(profile);
  mocks.resolveOAuthIdentity.mockResolvedValue({
    user: { id: "user-123", handle_name: "test-user" },
    session: { token: "test-jwt", expiresIn: "1d" },
  });
});

describe("OAuth callback controller", () => {
  it.each(["google", "github"])("authenticates an authorized %s account", async provider => {
    const providerFlow = { ...flow, provider };
    const { req, res } = makeContext({ provider, cookie: JSON.stringify(providerFlow) });

    await oauthCallback(req, res);

    expectRedirect(res, "success");
    expect(mocks.exchangeCode).toHaveBeenCalledWith(provider, "valid-code", flow.codeVerifier);
    expect(mocks.getProviderProfile).toHaveBeenCalledWith(provider, tokens.accessToken);
    expect(mocks.resolveOAuthIdentity).toHaveBeenCalledWith({
      provider,
      profile,
      tokens,
      userId: null,
    });

    expect(res.cookie).toHaveBeenCalledWith(
      "session",
      "test-jwt",
      expect.objectContaining({
        signed: true,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      })
    );
  });

  it("links an external account to an authenticated user", async () => {
    const authenticatedFlow = { ...flow, userId: "user-123" };
    const { req, res } = makeContext({ cookie: JSON.stringify(authenticatedFlow) });

    await oauthCallback(req, res);

    expectRedirect(res, "success");
    expect(mocks.resolveOAuthIdentity).toHaveBeenCalledWith({
      provider: "google",
      profile,
      tokens,
      userId: "user-123",
    });
  });

  it("rejects an unsupported provider", async () => {
    const { req, res } = makeContext({ provider: "other" });

    await oauthCallback(req, res);

    expectRedirect(res, "invalid_provider");
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.resolveOAuthIdentity).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("handles user denial", async () => {
    const { req, res } = makeContext({ query: { error: "access_denied" } });

    await oauthCallback(req, res);

    expectRedirect(res, "access_denied");
    expect(mocks.resolveOAuthIdentity).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it.each([
    ["missing cookie", null],
    ["tampered cookie signature", false],
    ["malformed cookie", "not-json"],
    ["expired flow", JSON.stringify({ ...flow, issuedAt: Date.now() - 301000 })],
    ["future flow", JSON.stringify({ ...flow, issuedAt: Date.now() + 60000 })],
    ["different provider", JSON.stringify({ ...flow, provider: "github" })],
    ["invalid userId", JSON.stringify({ ...flow, userId: 123 })],
  ])("rejects %s", async (_label, cookie) => {
    const { req, res } = makeContext({ cookie });

    await oauthCallback(req, res);

    expectRedirect(res, "invalid_state");
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.resolveOAuthIdentity).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("rejects a mismatched state", async () => {
    const { req, res } = makeContext({
      query: { state: "wrong-state", code: "valid-code" },
    });

    await oauthCallback(req, res);

    expectRedirect(res, "invalid_state");
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.resolveOAuthIdentity).not.toHaveBeenCalled();
  });

  it("rejects an absent authorization code", async () => {
    const { req, res } = makeContext({ query: { state: flow.state } });

    await oauthCallback(req, res);

    expectRedirect(res, "invalid_code");
    expect(mocks.resolveOAuthIdentity).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("redirects when the authorization code is rejected", async () => {
    mocks.exchangeCode.mockRejectedValue(new OAuthCallbackError("invalid_code"));
    const { req, res } = makeContext();

    await oauthCallback(req, res);

    expectRedirect(res, "invalid_code");
    expect(mocks.resolveOAuthIdentity).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("redirects on provider unavailability", async () => {
    mocks.getProviderProfile.mockRejectedValue(new OAuthCallbackError("provider_unavailable"));
    const { req, res } = makeContext();

    await oauthCallback(req, res);

    expectRedirect(res, "provider_unavailable");
    expect(mocks.resolveOAuthIdentity).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("handles account conflicts", async () => {
    mocks.resolveOAuthIdentity.mockRejectedValue(new ConflictError("account_conflict"));
    const { req, res } = makeContext();

    await oauthCallback(req, res);

    expectRedirect(res, "account_conflict");
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("handles email conflicts", async () => {
    mocks.resolveOAuthIdentity.mockRejectedValue(new ConflictError("email_conflict"));
    const { req, res } = makeContext();

    await oauthCallback(req, res);

    expectRedirect(res, "email_conflict");
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("handles missing provider information", async () => {
    mocks.resolveOAuthIdentity.mockRejectedValue(new ConflictError("additional_info_required"));
    const { req, res } = makeContext();

    await oauthCallback(req, res);

    expectRedirect(res, "additional_info_required");
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("handles unexpected persistence failures", async () => {
    mocks.resolveOAuthIdentity.mockRejectedValue(new Error("Database unavailable"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { req, res } = makeContext();

    try {
      await oauthCallback(req, res);

      expectRedirect(res, "internal_error");
      expect(spy).toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});