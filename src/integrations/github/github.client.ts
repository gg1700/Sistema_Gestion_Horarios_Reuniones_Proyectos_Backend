const API_ORIGIN = "https://api.github.com";

export class GitHubClientError extends Error {
  constructor(public readonly code: string, public readonly statusCode: number, message: string, public readonly retryAfterSeconds?: number) {
    super(message);
  }
}

export class GitHubClient {
  constructor(private readonly token: string, private readonly fetcher: typeof fetch = fetch) {}

  async get<T>(path: string): Promise<{ data: T; headers: Headers }> {
    let url = new URL(path, API_ORIGIN);
    const signal = AbortSignal.timeout(8000);
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (url.origin !== API_ORIGIN || url.username || url.password) throw new GitHubClientError("GITHUB_INVALID_URL", 502, "Respuesta inválida de GitHub.");
      let response: Response;
      try {
        response = await this.fetcher(url.toString(), { signal, redirect: "manual", headers: {
          Authorization: `Bearer ${this.token}`, Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "orbitia-backend",
        } });
      } catch { throw new GitHubClientError("GITHUB_UNAVAILABLE", 502, "No se pudo contactar con GitHub."); }
      if ([301, 302, 307, 308].includes(response.status) && response.headers.get("location")) {
        url = new URL(response.headers.get("location")!, url); continue;
      }
      if (response.status === 401) throw new GitHubClientError("GITHUB_REAUTH_REQUIRED", 409, "Vuelve a autorizar tu cuenta de GitHub.");
      if (response.status === 429 || (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")))) {
        const retry = Number(response.headers.get("retry-after"));
        const reset = Number(response.headers.get("x-ratelimit-reset"));
        const seconds = retry > 0 ? Math.ceil(retry) : reset > 0 ? Math.max(1, Math.ceil(reset - Date.now() / 1000)) : 60;
        throw new GitHubClientError("GITHUB_RATE_LIMITED", 429, "GitHub ha limitado temporalmente las consultas.", seconds);
      }
      if (response.status === 403) throw new GitHubClientError("GITHUB_PERMISSION_REQUIRED", 403, "GitHub no ha autorizado esta consulta.");
      if (!response.ok) throw new GitHubClientError("GITHUB_UNAVAILABLE", 502, "GitHub no pudo completar la consulta.");
      try { return { data: await response.json() as T, headers: response.headers }; }
      catch { throw new GitHubClientError("GITHUB_INVALID_RESPONSE", 502, "Respuesta inválida de GitHub."); }
    }
    throw new GitHubClientError("GITHUB_UNAVAILABLE", 502, "GitHub devolvió demasiadas redirecciones.");
  }
}