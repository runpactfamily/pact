import { PactError } from "../../errors";
import { fetchJson } from "../../utils/http";
import { sanitizeText } from "../../utils/text";
import type { GitHubProvider, RepoInfo, RepoTreeEntry } from "../types";

interface RepoResponse {
  full_name?: string;
  description?: string | null;
  default_branch?: string;
  language?: string | null;
  stargazers_count?: number;
  html_url?: string;
}

interface TreeResponse {
  tree?: { path?: string; type?: string; size?: number }[];
  truncated?: boolean;
}

interface ContentResponse {
  content?: string;
  encoding?: string;
  size?: number;
}

const SAFE_NAME = /^[\w.-]{1,100}$/;

export class GitHubApiProvider implements GitHubProvider {
  readonly vendor = "github";

  constructor(
    private readonly token: string,
    private readonly apiUrl = "https://api.github.com",
  ) {}

  private headers() {
    return {
      authorization: `Bearer ${this.token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "pact-agent",
    };
  }

  private check(owner: string, repo: string) {
    if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(repo)) throw new PactError("INVALID_REQUEST", "Repository must be owner/name.");
  }

  async getRepository(owner: string, repo: string, options?: { timeoutMs?: number }): Promise<RepoInfo> {
    this.check(owner, repo);
    const data = await fetchJson<RepoResponse>(`${this.apiUrl}/repos/${owner}/${repo}`, {
      provider: "GitHub",
      timeoutMs: options?.timeoutMs ?? 15_000,
      headers: this.headers(),
    });
    if (!data.full_name) throw new PactError("MALFORMED_PROVIDER_RESPONSE", "GitHub returned an unexpected shape.");
    return {
      fullName: data.full_name,
      description: data.description ? sanitizeText(data.description, 400) : null,
      defaultBranch: data.default_branch ?? "main",
      language: data.language ?? null,
      stars: data.stargazers_count ?? 0,
      url: data.html_url ?? `https://github.com/${owner}/${repo}`,
    };
  }

  async getTree(owner: string, repo: string, ref: string, options?: { timeoutMs?: number; maxEntries?: number }): Promise<RepoTreeEntry[]> {
    this.check(owner, repo);
    const data = await fetchJson<TreeResponse>(
      `${this.apiUrl}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      { provider: "GitHub", timeoutMs: options?.timeoutMs ?? 20_000, headers: this.headers() },
    );
    if (!Array.isArray(data.tree)) throw new PactError("MALFORMED_PROVIDER_RESPONSE", "GitHub returned an unexpected tree.");
    return data.tree
      .filter((e) => typeof e.path === "string" && (e.type === "blob" || e.type === "tree"))
      .slice(0, options?.maxEntries ?? 2000)
      .map((e) => ({ path: e.path as string, type: e.type as "blob" | "tree", size: e.size }));
  }

  async getFile(owner: string, repo: string, path: string, ref: string, options?: { timeoutMs?: number; maxChars?: number }): Promise<string> {
    this.check(owner, repo);
    if (path.includes("..") || path.startsWith("/")) throw new PactError("INVALID_REQUEST", "Invalid file path.");
    const data = await fetchJson<ContentResponse>(
      `${this.apiUrl}/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
      { provider: "GitHub", timeoutMs: options?.timeoutMs ?? 15_000, headers: this.headers() },
    );
    if (typeof data.content !== "string" || data.encoding !== "base64") {
      throw new PactError("MALFORMED_PROVIDER_RESPONSE", "GitHub returned a file in an unexpected format.");
    }
    return sanitizeText(Buffer.from(data.content, "base64").toString("utf8"), options?.maxChars ?? 20_000);
  }
}
