/** Cliente compartido por actividad y repositorios (T-39). */
export async function createGithubClient(accessToken: string) {
  const { Octokit } = await import("octokit");
  const client = new Octokit({
    auth: accessToken,
    userAgent: "orbitia-backend",
    request: { timeout: 8000 },
    // No mantener una petición HTTP del usuario esperando el reinicio de cuota.
    throttle: { onRateLimit: () => false, onSecondaryRateLimit: () => false },
    retry: { enabled: false },
    log: { debug() {}, info() {}, warn() {}, error() {} },
  });
  client.request = client.request.defaults({ headers: { "X-GitHub-Api-Version": "2026-03-10" } });
  return client;
}

export class GithubRepositoryError extends Error {
  constructor(public statusCode: number, public code: string, message: string, public retryAfter?: number) {
    super(message);
  }
}

export function githubRequestError(error: unknown): GithubRepositoryError {
  const value = error as { status?: number; response?: { headers?: Record<string, string>; data?: { message?: string } } };
  const headers = value?.response?.headers ?? {};
  if (value?.status === 401) return new GithubRepositoryError(409, "GITHUB_REAUTH_REQUIRED", "Vuelve a autorizar tu cuenta de GitHub.");
  const secondaryLimit = /secondary rate limit|abuse detection/i.test(value?.response?.data?.message ?? "");
  if (value?.status === 429 || (value?.status === 403 && (headers["x-ratelimit-remaining"] === "0" || headers["retry-after"] || secondaryLimit))) {
    const delay = Number(headers["retry-after"]) || Math.ceil(Number(headers["x-ratelimit-reset"]) - Date.now() / 1000) || 60;
    return new GithubRepositoryError(429, "GITHUB_RATE_LIMIT", "GitHub alcanzó su límite de consultas. Inténtalo más tarde.", Math.max(1, delay));
  }
  if (value?.status === 403) return new GithubRepositoryError(403, "GITHUB_PERMISSION_DENIED", "GitHub no concedió permiso para consultar los repositorios.");
  return new GithubRepositoryError(502, "GITHUB_UNAVAILABLE", "No se pudo consultar GitHub. Conservamos tu selección; vuelve a intentarlo.");
}
