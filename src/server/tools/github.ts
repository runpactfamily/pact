import { PactError } from "../errors";
import type { RepoTreeEntry } from "../providers/types";
import { keywords } from "../utils/text";
import type { Evidence, Tool } from "./types";

type Action = "overview" | "tree" | "file";

interface Input {
  repo: string;
  action?: Action;
  path?: string;
  /** What the job is about; steers which files are read. */
  query?: string;
}

const KEY_FILES = /^(readme(\.md|\.rst|\.txt)?|package\.json|pyproject\.toml|go\.mod|cargo\.toml|composer\.json|docs\/(readme|architecture|overview|index)\.md|architecture\.md|contributing\.md)$/i;
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|cs|swift|scala|sql|md|yml|yaml|toml|json|prisma|graphql|proto)$/i;
const SKIP_PATH = /(^|\/)(node_modules|dist|build|out|vendor|\.next|coverage|__pycache__|\.git|target|bin|obj)(\/|$)|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|.*\.min\.(js|css)|.*\.lock)$/i;

const MAX_RELEVANT_FILES = 6;
const MAX_FILE_CHARS = 8_000;
const MAX_TOTAL_CHARS = 40_000;
const MAX_FILE_BYTES = 120_000;

export function parseRepo(raw: string): { owner: string; repo: string } {
  const value = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  const m = value.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) throw new PactError("INVALID_REQUEST", "Repository must be in the form owner/name.");
  return { owner: m[1], repo: m[2] };
}

/** Scores paths by how well they match the job's terms; prefers source files near the root. */
export function rankRelevantFiles(files: RepoTreeEntry[], query: string, max = MAX_RELEVANT_FILES): RepoTreeEntry[] {
  const terms = keywords(query).slice(0, 10);
  const scored = files
    .filter((f) => f.type === "blob" && SOURCE_EXT.test(f.path) && !SKIP_PATH.test(f.path) && !KEY_FILES.test(f.path) && (f.size ?? 0) <= MAX_FILE_BYTES)
    .map((f) => {
      const lower = f.path.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (lower.includes(term)) score += 3;
        else if (term.length > 4 && lower.includes(term.slice(0, 5))) score += 1;
      }
      // Entry points and shallow files explain more per byte.
      if (/(^|\/)(index|main|app|server|routes?|router|config)\.[a-z]+$/i.test(f.path)) score += 1;
      score -= Math.min(2, f.path.split("/").length * 0.25);
      return { f, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.f.path.length - b.f.path.length);
  return scored.slice(0, max).map((s) => s.f);
}

export const githubTool: Tool<Input, Record<string, unknown>> = {
  name: "github",
  description: "Read a GitHub repository (read-only): overview with key and relevant files, the file tree, or one file.",
  stage: "researching",
  inputSchema: {
    type: "object",
    properties: {
      repo: { type: "string", description: "owner/name or GitHub URL" },
      action: { type: "string", enum: ["overview", "tree", "file"], description: "default overview" },
      path: { type: "string", description: "File path, for action=file" },
      query: { type: "string", description: "What to look for; picks which files are read in an overview" },
    },
    required: ["repo"],
  },
  outputSchema: { type: "object", properties: { repo: { type: "string" }, action: { type: "string" }, files: { type: "number" }, read: { type: "array", items: { type: "string" } } } },
  isAvailable: (providers) =>
    providers.github ? { available: true } : { available: false, reason: "GitHub access is unavailable: GITHUB_TOKEN is not set." },
  async execute(input, context) {
    const provider = context.providers.github;
    if (!provider) throw new PactError("PROVIDER_UNAVAILABLE", "GitHub access is temporarily unavailable.");
    const { owner, repo } = parseRepo(input.repo);
    const action: Action = input.action ?? "overview";
    const info = await provider.getRepository(owner, repo, { timeoutMs: context.timeoutMs });
    const fileUrl = (path: string) => `${info.url}/blob/${info.defaultBranch}/${path}`;

    if (action === "file") {
      if (!input.path) throw new PactError("INVALID_REQUEST", "A file path is required.");
      const content = await provider.getFile(owner, repo, input.path, info.defaultBranch, { timeoutMs: context.timeoutMs });
      return {
        data: { repo: info.fullName, action, path: input.path, chars: content.length },
        summary: `Read ${info.fullName}/${input.path}`,
        evidence: [{ kind: "repo", label: `${info.fullName}/${input.path}`, url: fileUrl(input.path), text: content, provider: "github" }],
      };
    }

    const tree = await provider.getTree(owner, repo, info.defaultBranch, { timeoutMs: context.timeoutMs });
    const files = tree.filter((e) => e.type === "blob");
    const dirs = new Set(files.map((f) => f.path.split("/")[0]).filter((p) => !p.includes(".")));
    const overviewText = [
      `${info.fullName}${info.description ? `: ${info.description}` : ""}`,
      `Default branch ${info.defaultBranch}; ${files.length} files; primary language ${info.language ?? "unknown"}; ${info.stars} stars.`,
      `Top-level directories: ${[...dirs].slice(0, 20).join(", ") || "none"}.`,
    ].join("\n");
    const evidence: Evidence[] = [{ kind: "repo", label: info.fullName, url: info.url, text: overviewText, provider: "github" }];

    if (action === "tree") {
      const listing = files.slice(0, 400).map((f) => f.path).join("\n");
      evidence.push({ kind: "repo", label: `${info.fullName} file tree`, url: info.url, text: listing, provider: "github" });
      return { data: { repo: info.fullName, action, files: files.length }, summary: `Listed ${files.length} files in ${info.fullName}`, evidence };
    }

    // Overview: the files that explain a repository, then the ones the job is about. Targeted, budgeted, read-only.
    const keyPicks = files.filter((f) => KEY_FILES.test(f.path)).slice(0, 3);
    const relevant = input.query ? rankRelevantFiles(files, input.query) : [];
    const read: string[] = [];
    let budget = MAX_TOTAL_CHARS;
    for (const pick of [...keyPicks, ...relevant]) {
      if (budget <= 1_000) break;
      try {
        const content = await provider.getFile(owner, repo, pick.path, info.defaultBranch, { timeoutMs: context.timeoutMs, maxChars: Math.min(MAX_FILE_CHARS, budget) });
        budget -= content.length;
        read.push(pick.path);
        evidence.push({ kind: "repo", label: `${info.fullName}/${pick.path}`, url: fileUrl(pick.path), text: content, provider: "github" });
      } catch {
        // A missing or oversized file is not a reason to fail the overview.
      }
    }
    // A compact tree so the model knows what else exists without reading it.
    const treeSample = files.slice(0, 150).map((f) => f.path).join("\n");
    evidence.push({ kind: "repo", label: `${info.fullName} file tree (first ${Math.min(150, files.length)})`, url: info.url, text: treeSample, provider: "github" });

    return {
      data: { repo: info.fullName, action, files: files.length, read },
      summary: `Read ${info.fullName}: ${files.length} files, ${read.length} opened`,
      evidence,
    };
  },
};
