import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  processTransaction: vi.fn(),
  encryptToken: vi.fn((value: string) => `encrypted:${value}`),
}));

vi.mock("../src/utils/query", () => ({ processTransaction: mocks.processTransaction }));
vi.mock("../src/utils/token", () => ({ encryptToken: mocks.encryptToken }));

import { resolveAccount } from "../src/repositories/oauth-decision.repository";

const input = {
  provider: "github" as const,
  profile: {
    id: "github-456",
    username: "ana-dev",
    name: "Ana Perez",
    email: "ana@example.com",
    avatarUrl: "https://example.com/avatar.png",
    profileUrl: "https://github.com/ana-dev",
  },
  tokens: {
    accessToken: "plain-access-token",
    refreshToken: null,
    expiresAt: null,
    scopes: "read:user user:email",
  },
  userId: null as string | null,
  name: "Ana",
  firstSurname: "Perez",
  handleBase: "ana-dev",
};

const user = { id: "user-123", handle_name: "ana-dev" };

function mockQueries(...results: Array<{ rows: unknown[]; rowCount?: number }>) {
  mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
  for (const result of results) {
    mocks.query.mockResolvedValueOnce({ rowCount: result.rowCount ?? result.rows.length, rows: result.rows });
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.encryptToken.mockImplementation((value: string) => `encrypted:${value}`);
  mocks.processTransaction.mockImplementation(async (callback: (client: { query: typeof mocks.query }) => Promise<unknown>) => {
    return callback({ query: mocks.query });
  });
});

describe("OAuth decision repository", () => {
  it("logs in an already linked external identity and refreshes its encrypted token", async () => {
    mockQueries(
      { rows: [user] },
      { rows: [{ id: "external-123" }] }
    );

    const result = await resolveAccount(input);

    expect(result).toEqual(user);
    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(mocks.encryptToken).toHaveBeenCalledWith("plain-access-token");
    const [sql, values] = mocks.query.mock.calls[2] as [string, unknown[]];
    expect(sql).toContain("ON CONFLICT (user_id, provider)");
    expect(values[5]).toBe("encrypted:plain-access-token");
    expect(values).not.toContain("plain-access-token");
  });

  it("links GitHub to the authenticated user without creating another user", async () => {
    mockQueries(
      { rows: [] },
      { rows: [user] },
      { rows: [{ id: "external-123" }] }
    );

    const result = await resolveAccount({ ...input, userId: user.id });

    expect(result).toEqual(user);
    expect(mocks.query).toHaveBeenCalledTimes(4);
    const sqlStatements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(sqlStatements).not.toContainEqual(expect.stringContaining('INSERT INTO public."user"'));
    expect(sqlStatements).not.toContainEqual(expect.stringContaining("INSERT INTO public.link"));
  });

  it("rejects linking an external identity belonging to another user", async () => {
    mockQueries({ rows: [user] });

    await expect(resolveAccount({ ...input, userId: "other-user" }))
      .rejects.toMatchObject({ name: "ConflictError", message: "account_conflict" });

    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.encryptToken).not.toHaveBeenCalled();
  });

  it("creates a user and saves hidden email and GitHub link", async () => {
    mockQueries(
      { rows: [] },
      { rows: [] },
      { rows: [user] },
      { rows: [{ id: "external-123" }] },
      { rows: [{ id: "email-123" }] },
      { rows: [] },
      { rows: [] }
    );

    const result = await resolveAccount(input);

    expect(result).toEqual(user);
    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(statements).toEqual(expect.arrayContaining([
      expect.stringContaining('INSERT INTO public."user"'),
      expect.stringContaining("INSERT INTO public.external_account"),
      expect.stringContaining("INSERT INTO public.user_email"),
      expect.stringContaining("INSERT INTO public.link"),
    ]));
    const emailSql = statements.find(sql => sql.includes("INSERT INTO public.user_email"));
    const linkSql = statements.find(sql => sql.includes("INSERT INTO public.link"));
    expect(emailSql).toContain("false");
    expect(linkSql).toContain("false");
    expect(mocks.query.mock.calls[3][1]).toEqual([
      "ana-dev", "Ana", "Perez", "ana@example.com", "https://example.com/avatar.png",
    ]);
  });

  it("adds a numeric suffix when the first handle is occupied", async () => {
    mockQueries(
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [{ id: "user-123", handle_name: "ana-dev-1" }] },
      { rows: [{ id: "external-123" }] },
      { rows: [{ id: "email-123" }] },
      { rows: [] },
      { rows: [] }
    );

    const result = await resolveAccount(input);
    expect(result.handle_name).toBe("ana-dev-1");
    expect(mocks.query.mock.calls[3][1][0]).toBe("ana-dev");
    expect(mocks.query.mock.calls[5][1][0]).toBe("ana-dev-1");
  });

  it("does not merge a different user with an existing email", async () => {
    mockQueries({ rows: [] }, { rows: [{ id: "another-user" }] });

    await expect(resolveAccount(input))
      .rejects.toMatchObject({ name: "ConflictError", message: "email_conflict" });

    expect(mocks.query).toHaveBeenCalledTimes(3);
  });

  it("rejects missing email when a new user must be created", async () => {
    mockQueries({ rows: [] });

    await expect(resolveAccount({
      ...input,
      profile: { ...input.profile, email: null },
    })).rejects.toMatchObject({ name: "ConflictError", message: "additional_info_required" });

    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("rejects inactive session users when linking", async () => {
    mockQueries({ rows: [] }, { rows: [] });

    await expect(resolveAccount({ ...input, userId: "inactive-user" }))
      .rejects.toMatchObject({ name: "ConflictError", message: "invalid_session" });
  });
});
