import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  getProviderProfile: vi.fn(),
  saveExternalAccount: vi.fn(),
}));

vi.mock("../src/services/oauth-callback.service", () => ({
  exchangeCode: mocks.exchangeCode,
  getProviderProfile: mocks.getProviderProfile,
}));
vi.mock("../src/repositories/oauth-callback.repository", () => ({ saveExternalAccount: mocks.saveExternalAccount }));

import { oauthCallback } from "../src/controllers/oauth-callback.controller";
import { OAuthCallbackError } from "../src/types/oauth-callback.types";

const flow = { provider: "google", state: "test-state", codeVerifier: "test-verifier", userId: "user-123", issuedAt: Date.now() };
const tokens = { accessToken: "test-access-token", refreshToken: null, expiresAt: null, scopes: "openid email" };
const profile = { id: "google-123", username: "user@gmail.com", name: "Test", email: "user@gmail.com", avatarUrl: null, profileUrl: null };

function makeContext(options: {
  provider?: string;
  query?: Record<string, unknown>;
  cookie?: unknown;
} = {}) {
  const req = {
    params: { provider: options.provider ?? "google" },
    query: options.query ?? { state: flow.state, code: "valid-code" },
    signedCookies: { oauth_flow: options.cookie === undefined ? JSON.stringify(flow) : options.cookie },
  } as unknown as Request;

  const res = {
    set: vi.fn(),
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
  expect(res.clearCookie).toHaveBeenCalledWith("oauth_flow", expect.objectContaining({ path: "/api/v1/auth" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  flow.issuedAt = Date.now();
  mocks.exchangeCode.mockResolvedValue(tokens);
  mocks.getProviderProfile.mockResolvedValue(profile);
  mocks.saveExternalAccount.mockResolvedValue(undefined);
});

describe("OAuth callback controller", () => {
  it.each(["google", "github"])("links an authorized %s account", async provider => {
    const providerFlow = { ...flow, provider };
    const { req, res } = makeContext({ provider, cookie: JSON.stringify(providerFlow) });
    await oauthCallback(req, res);
    expectRedirect(res, "success");
    expect(mocks.exchangeCode).toHaveBeenCalledWith(provider, "valid-code", flow.codeVerifier);
    expect(mocks.getProviderProfile).toHaveBeenCalledWith(provider, tokens.accessToken);
    expect(mocks.saveExternalAccount).toHaveBeenCalledWith({ userId: flow.userId, provider, profile, tokens });
  });

  it("rejects an unsupported provider", async () => {
    const { req, res } = makeContext({ provider: "other" });
    await oauthCallback(req, res);
    expectRedirect(res, "invalid_provider");
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it("handles user denial", async () => {
    const { req, res } = makeContext({ query: { error: "access_denied" } });
    await oauthCallback(req, res);
    expectRedirect(res, "access_denied");
    expect(mocks.saveExternalAccount).not.toHaveBeenCalled();
  });

  it.each([
    ["missing cookie", null],
    ["tampered cookie signature", false],
    ["malformed cookie", "not-json"],
    ["expired flow", JSON.stringify({ ...flow, issuedAt: Date.now() - 301000 })],
    ["future flow", JSON.stringify({ ...flow, issuedAt: Date.now() + 60000 })],
    ["different provider", JSON.stringify({ ...flow, provider: "github" })],
  ])("rejects %s", async (_label, cookie) => {
    const { req, res } = makeContext({ cookie });
    await oauthCallback(req, res);
    expectRedirect(res, "invalid_state");
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.saveExternalAccount).not.toHaveBeenCalled();
  });

  it("rejects a mismatched state", async () => {
    const { req, res } = makeContext({ query: { state: "wrong-state", code: "valid-code" } });
    await oauthCallback(req, res);
    expectRedirect(res, "invalid_state");
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it("rejects an absent authorization code", async () => {
    const { req, res } = makeContext({ query: { state: flow.state } });
    await oauthCallback(req, res);
    expectRedirect(res, "invalid_code");
    expect(mocks.saveExternalAccount).not.toHaveBeenCalled();
  });

  it("redirects when the authorization code is rejected", async () => {
    mocks.exchangeCode.mockRejectedValue(new OAuthCallbackError("invalid_code"));
    const { req, res } = makeContext();
    await oauthCallback(req, res);
    expectRedirect(res, "invalid_code");
    expect(mocks.saveExternalAccount).not.toHaveBeenCalled();
  });

  it("redirects on provider unavailability", async () => {
    mocks.getProviderProfile.mockRejectedValue(new OAuthCallbackError("provider_unavailable"));
    const { req, res } = makeContext();
    await oauthCallback(req, res);
    expectRedirect(res, "provider_unavailable");
    expect(mocks.saveExternalAccount).not.toHaveBeenCalled();
  });

  it("handles account conflicts", async () => {
    const error = new Error("Account already linked");
    error.name = "ConflictError";
    mocks.saveExternalAccount.mockRejectedValue(error);
    const { req, res } = makeContext();
    await oauthCallback(req, res);
    expectRedirect(res, "account_conflict");
  });

  it("handles unexpected persistence failures", async () => {
    mocks.saveExternalAccount.mockRejectedValue(new Error("Database unavailable"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { req, res } = makeContext();
    try {
      await oauthCallback(req, res);
      expectRedirect(res, "internal_error");
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});