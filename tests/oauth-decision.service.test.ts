
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "../src/helpers/errors.helper";

const mocks = vi.hoisted(() => ({
  resolveAccount: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("../src/repositories/oauth-decision.repository", () => ({
  resolveAccount: mocks.resolveAccount,
}));

vi.mock("../src/services/session.service", () => ({
  createSession: mocks.createSession,
}));

import { resolveOAuthIdentity } from "../src/services/oauth-decision.service";

const tokens = {
  accessToken: "access-token",
  refreshToken: null,
  expiresAt: null,
  scopes: "read:user user:email",
};

const googleProfile = {
  id: "google-123",
  username: null,
  name: "Ana Perez",
  email: " ANA@EXAMPLE.COM ",
  avatarUrl: "https://example.com/avatar.png",
  profileUrl: null,
};

const githubProfile = {
  id: "github-456",
  username: "Ana.Dev",
  name: "Ana Perez",
  email: "ana@example.com",
  avatarUrl: "https://example.com/github.png",
  profileUrl: "https://github.com/Ana.Dev",
};

beforeEach(() => {
  vi.resetAllMocks();

  mocks.resolveAccount.mockResolvedValue({
    id: "user-123",
    handle_name: "ana-perez",
  });

  mocks.createSession.mockReturnValue({
    token: "test-jwt",
    expiresIn: "1d",
  });
});

describe("OAuth identity decision service", () => {
  it("resolves Google login and creates a session", async () => {
    const result = await resolveOAuthIdentity({
      provider: "google",
      profile: googleProfile,
      tokens,
      userId: null,
    });

    expect(mocks.resolveAccount).toHaveBeenCalledWith({
      provider: "google",
      profile: {
        ...googleProfile,
        email: "ana@example.com",
      },
      tokens,
      userId: null,
      name: "Ana",
      firstSurname: "Perez",
      handleBase: "ana-perez",
    });

    expect(mocks.createSession).toHaveBeenCalledWith(
      "user-123",
      "ana-perez"
    );

    expect(result.session.token).toBe("test-jwt");
  });

  it("uses the GitHub username to generate the handle", async () => {
    await resolveOAuthIdentity({
      provider: "github",
      profile: githubProfile,
      tokens,
      userId: null,
    });

    expect(mocks.resolveAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "github",
        userId: null,
        handleBase: "ana-dev",
      })
    );
  });

  it("links GitHub to the current user", async () => {
    await resolveOAuthIdentity({
      provider: "github",
      profile: githubProfile,
      tokens,
      userId: "user-123",
    });

    expect(mocks.resolveAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "github",
        userId: "user-123",
      })
    );
  });

  it("uses provisional values when the provider has no name", async () => {
    await resolveOAuthIdentity({
      provider: "github",
      profile: {
        ...githubProfile,
        name: null,
      },
      tokens,
      userId: null,
    });

    expect(mocks.resolveAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Usuario",
        firstSurname: "Pendiente",
        handleBase: "ana-dev",
      })
    );
  });

  it("uses a provisional surname for a single name", async () => {
    await resolveOAuthIdentity({
      provider: "google",
      profile: {
        ...googleProfile,
        name: "Ana",
      },
      tokens,
      userId: null,
    });

    expect(mocks.resolveAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Ana",
        firstSurname: "Pendiente",
      })
    );
  });

  it("preserves missing provider email as null", async () => {
    await resolveOAuthIdentity({
      provider: "github",
      profile: {
        ...githubProfile,
        email: null,
      },
      tokens,
      userId: null,
    });

    expect(mocks.resolveAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          email: null,
        }),
      })
    );
  });

  it("propagates email conflicts without creating a session", async () => {
    mocks.resolveAccount.mockRejectedValue(
      new ConflictError("email_conflict")
    );

    await expect(
      resolveOAuthIdentity({
        provider: "google",
        profile: googleProfile,
        tokens,
        userId: null,
      })
    ).rejects.toThrow("email_conflict");

    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("propagates account conflicts without creating a session", async () => {
    mocks.resolveAccount.mockRejectedValue(
      new ConflictError("account_conflict")
    );

    await expect(
      resolveOAuthIdentity({
        provider: "github",
        profile: githubProfile,
        tokens,
        userId: "user-123",
      })
    ).rejects.toThrow("account_conflict");

    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
