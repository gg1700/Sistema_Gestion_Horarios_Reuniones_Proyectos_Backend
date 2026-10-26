
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { ConflictError } from "../src/helpers/errors.helper";
import { OAuthCallbackError } from "../src/types/oauth-callback.types";

const mocks = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  getProviderProfile: vi.fn(),
  resolveOAuthIdentity: vi.fn(),
  verifySession: vi.fn(),
  isActiveProfileUser: vi.fn(),
}));

vi.mock("../src/services/oauth-callback.service", () => ({
  exchangeCode: mocks.exchangeCode,
  getProviderProfile: mocks.getProviderProfile,
}));

vi.mock("../src/services/oauth-decision.service", () => ({
  resolveOAuthIdentity: mocks.resolveOAuthIdentity,
}));

vi.mock("../src/services/session.service", () => ({
  verifySession: mocks.verifySession,
}));

vi.mock("../src/repositories/profile-read.repository", () => ({
  isActiveProfileUser: mocks.isActiveProfileUser,
}));

import { oauthCallback } from "../src/controllers/oauth-callback.controller";

const flow = {
  provider: "google",
  state: "test-state",
  codeVerifier: "test-verifier",
  intent: "login" as "login" | "link",
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
  username: "test-user",
  name: "Test User",
  email: "user@gmail.com",
  avatarUrl: null,
  profileUrl: null,
};

function makeContext(options: {
  provider?: string;
  query?: Record<string, unknown>;
  cookie?: unknown;
  session?: unknown;
  authorization?: string;
} = {}) {
  const req = {
    params: { provider: options.provider ?? "google" },
    query: options.query ?? { state: flow.state, code: "valid-code" },
    headers: {
      ...(options.authorization ? { authorization: options.authorization } : {}),
    },
    signedCookies: {
      oauth_flow: options.cookie === undefined ? JSON.stringify(flow) : options.cookie,
      session: options.session === undefined ? "test-session-token" : options.session,
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

function expectNoAuthentication(res: Response) {
  expect(mocks.exchangeCode).not.toHaveBeenCalled();
  expect(mocks.resolveOAuthIdentity).not.toHaveBeenCalled();
  expect(res.cookie).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  flow.issuedAt = Date.now();
  flow.intent = "login";
  flow.userId = null;

  mocks.exchangeCode.mockResolvedValue(tokens);
  mocks.getProviderProfile.mockResolvedValue(profile);

  mocks.resolveOAuthIdentity.mockResolvedValue({
    user: { id: "user-123", handle_name: "test-user" },
    session: { token: "test-jwt", expiresIn: "1d" },
  });

  mocks.verifySession.mockReturnValue({
    userId: "user-123",
    handlename: "test-user",
  });

  mocks.isActiveProfileUser.mockResolvedValue(true);
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

    expect(mocks.verifySession).not.toHaveBeenCalled();

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
    const authenticatedFlow = { ...flow, intent: "link", userId: "user-123" };
    const { req, res } = makeContext({ cookie: JSON.stringify(authenticatedFlow) });

    await oauthCallback(req, res);

    expectRedirect(res, "success");
    expect(mocks.verifySession).toHaveBeenCalledWith("test-session-token");
    expect(mocks.isActiveProfileUser).toHaveBeenCalledWith("user-123");

    expect(mocks.resolveOAuthIdentity).toHaveBeenCalledWith({
      provider: "google",
      profile,
      tokens,
      userId: "user-123",
    });

    expect(res.cookie).toHaveBeenCalledWith(
      "session",
      "test-jwt",
      expect.objectContaining({ signed: true, httpOnly: true })
    );
  });

  it("allows login without an existing session", async () => {
    const { req, res } = makeContext({ session: null });

    await oauthCallback(req, res);

    expectRedirect(res, "success");
    expect(mocks.verifySession).not.toHaveBeenCalled();
    expect(mocks.resolveOAuthIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null })
    );
  });

  it("rejects linking without an active session", async () => {
    const linkedFlow = { ...flow, intent: "link", userId: "user-123" };
    const { req, res } = makeContext({
      cookie: JSON.stringify(linkedFlow),
      session: null,
    });

    mocks.verifySession.mockImplementation((token: string) => {
      if (!token) throw new Error("Sesion requerida");
      return { userId: "user-123", handlename: "test-user" };
    });

    await oauthCallback(req, res);

    expectRedirect(res, "invalid_session");
    expectNoAuthentication(res);
  });

  it("rejects linking with an expired session", async () => {
    const linkedFlow = { ...flow, intent: "link", userId: "user-123" };
    mocks.verifySession.mockImplementation(() => {
      throw new Error("Session expired");
    });

    const { req, res } = makeContext({ cookie: JSON.stringify(linkedFlow) });

    await oauthCallback(req, res);

    expectRedirect(res, "invalid_session");
    expectNoAuthentication(res);
  });

  it("rejects linking when the session belongs to another user", async () => {
    const linkedFlow = { ...flow, intent: "link", userId: "user-123" };
    mocks.verifySession.mockReturnValue({
      userId: "other-user",
      handlename: "other",
    });

    const { req, res } = makeContext({ cookie: JSON.stringify(linkedFlow) });

    await oauthCallback(req, res);

    expectRedirect(res, "invalid_session");
    expectNoAuthentication(res);
  });

  it("rejects linking when the user is inactive", async () => {
    const linkedFlow = { ...flow, intent: "link", userId: "user-123" };
    mocks.isActiveProfileUser.mockResolvedValue(false);

    const { req, res } = makeContext({ cookie: JSON.stringify(linkedFlow) });

    await oauthCallback(req, res);

    expectRedirect(res, "invalid_session");
    expectNoAuthentication(res);
  });

  it("rejects an unsupported provider", async () => {
    const { req, res } = makeContext({ provider: "other" });

    await oauthCallback(req, res);

    expectRedirect(res, "invalid_provider");
    expectNoAuthentication(res);
  });

  it("handles user denial", async () => {
    const { req, res } = makeContext({ query: { error: "access_denied" } });

    await oauthCallback(req, res);

    expectRedirect(res, "access_denied");
    expectNoAuthentication(res);
  });

  it.each([
    ["missing cookie", null],
    ["tampered cookie signature", false],
    ["malformed cookie", "not-json"],
    ["expired flow", JSON.stringify({ ...flow, issuedAt: Date.now() - 301000 })],
    ["future flow", JSON.stringify({ ...flow, issuedAt: Date.now() + 60000 })],
    ["different provider", JSON.stringify({ ...flow, provider: "github" })],
    ["invalid userId", JSON.stringify({ ...flow, userId: 123 })],
    ["missing intent", JSON.stringify((({ intent, ...rest }) => rest)(flow))],
    ["invalid intent", JSON.stringify({ ...flow, intent: "invalid" })],
    ["login with userId", JSON.stringify({ ...flow, intent: "login", userId: "user-123" })],
    ["link without userId", JSON.stringify({ ...flow, intent: "link", userId: null })],
  ])("rejects %s", async (_label, cookie) => {
    const { req, res } = makeContext({ cookie });

    await oauthCallback(req, res);

    expectRedirect(res, "invalid_state");
    expectNoAuthentication(res);
  });

  it("rejects a mismatched state", async () => {
    const { req, res } = makeContext({
      query: { state: "wrong-state", code: "valid-code" },
    });

    await oauthCallback(req, res);

    expectRedirect(res, "invalid_state");
    expectNoAuthentication(res);
  });

  it("rejects an absent authorization code", async () => {
    const { req, res } = makeContext({ query: { state: flow.state } });

    await oauthCallback(req, res);

    expectRedirect(res, "invalid_code");
    expectNoAuthentication(res);
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

  it.each([
    ["account_conflict", "account_conflict"],
    ["email_conflict", "email_conflict"],
    ["additional_info_required", "additional_info_required"],
  ])("handles %s", async (errorCode, expected) => {
    mocks.resolveOAuthIdentity.mockRejectedValue(new ConflictError(errorCode));
    const { req, res } = makeContext();

    await oauthCallback(req, res);

    expectRedirect(res, expected);
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
