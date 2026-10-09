// Provider interfaces. Tools and the agent depend on these, never on a vendor.

export interface ProviderStatus {
  name: string;
  /** Vendor behind the interface, e.g. "openrouter"; for routers, the primary. */
  vendor: string | null;
  available: boolean;
  /** Fallback order when the interface is a router. */
  chain?: string[];
  /** Human-readable reason when unavailable. Never includes secrets. */
  reason?: string;
}

export interface LLMMessage {
  role: "system" | "user";
  content: string;
}

export interface FailoverInfo {
  from: { vendor: string; model: string };
  to: { vendor: string; model: string } | null;
  code: string;
}

export interface LLMGenerateOptions {
  messages: LLMMessage[];
  /** Ask the model for a JSON object. The provider sets the vendor-specific flag. */
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Called by routers each time they move to the next provider. */
  onFailover?: (info: FailoverInfo) => void;
}

export interface LLMGenerateResult {
  text: string;
  /** Vendor that actually answered. */
  vendor: string;
  model: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
  /** Providers tried before this one succeeded, with the error code each hit. */
  failovers?: { vendor: string; code: string }[];
}

export interface LLMProvider {
  readonly vendor: string;
  readonly model: string;
  generate(options: LLMGenerateOptions): Promise<LLMGenerateResult>;
}

/** Vendors a language model can come from. */
export type LLMVendor = "openrouter" | "gemini" | "groq";

/** How much reasoning a job needs. Decided before execution by the task router. */
export type TaskTier = "light" | "medium" | "heavy" | "complex";

export type ModelSelection = { mode: "auto" } | { mode: "manual"; provider: LLMVendor; model: string };

export interface ModelInfo {
  vendor: LLMVendor;
  id: string;
  name: string;
  contextLength?: number;
  /** USD per million tokens, when the vendor publishes it. */
  pricing?: { input: number; output: number };
  /** Family tag used by routing and the selector, e.g. "claude", "gemini", "gpt-oss". */
  family: string;
}

export interface ModelCatalog {
  fetchedAt: number;
  vendors: { vendor: LLMVendor; available: boolean; reason?: string; models: ModelInfo[] }[];
}

export interface LLMResolution {
  provider: LLMProvider;
  routing: { mode: "auto" | "manual"; tier: TaskTier; vendor: LLMVendor; model: string; chain: string[] };
}

/** Builds the right language model (and fallback order) for a run. */
export interface LLMPool {
  readonly vendors: LLMVendor[];
  catalog(): Promise<ModelCatalog>;
  resolve(selection: ModelSelection, tier: TaskTier): Promise<LLMResolution>;
}

export type SearchMode = "keyword" | "semantic";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Vendor that returned it. */
  source: string;
  publishedAt?: string;
  score?: number;
}

export interface SearchProvider {
  readonly vendor: string;
  search(query: string, options?: { maxResults?: number; timeoutMs?: number; mode?: SearchMode }): Promise<SearchResult[]>;
}

export interface ReadResult {
  url: string;
  title?: string;
  /** Plain text or markdown, already sanitized by the provider adapter. */
  content: string;
  metadata: {
    provider: string;
    chars: number;
    retrievedAt: string;
    publishedAt?: string;
    description?: string;
  };
}

export interface ReaderProvider {
  readonly vendor: string;
  read(url: string, options?: { timeoutMs?: number; maxChars?: number }): Promise<ReadResult>;
}

export interface CrawlProvider {
  readonly vendor: string;
  /** Discovers pages under a URL and reads up to maxPages of them. */
  crawl(url: string, options?: { maxPages?: number; timeoutMs?: number; maxChars?: number }): Promise<ReadResult[]>;
}

export interface RepoInfo {
  fullName: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  stars: number;
  url: string;
}

export interface RepoTreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export interface GitHubProvider {
  readonly vendor: string;
  getRepository(owner: string, repo: string, options?: { timeoutMs?: number }): Promise<RepoInfo>;
  getTree(owner: string, repo: string, ref: string, options?: { timeoutMs?: number; maxEntries?: number }): Promise<RepoTreeEntry[]>;
  getFile(owner: string, repo: string, path: string, ref: string, options?: { timeoutMs?: number; maxChars?: number }): Promise<string>;
}

export interface Providers {
  llm: LLMPool | null;
  search: SearchProvider | null;
  reader: ReaderProvider | null;
  crawl: CrawlProvider | null;
  github: GitHubProvider | null;
  status: ProviderStatus[];
}
