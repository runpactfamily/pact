// Server configuration, read once from the environment. Secrets never leave
// this module except through the provider adapters that need them.

export type PactMode = "development" | "production";
export type StorageKind = "auto" | "supabase" | "file" | "memory";

export interface ServerConfig {
  mode: PactMode;
  limits: {
    maxAgentSteps: number;
    maxToolCalls: number;
    toolTimeoutMs: number;
    runTimeoutMs: number;
    maxUploadBytes: number;
    maxSearchResults: number;
    maxSourceChars: number;
    maxContextChars: number;
    maxCrawlPages: number;
    parserTimeoutMs: number;
    llmTimeoutMs: number;
  };
  storage: StorageKind;
  dataDir: string;
  keys: {
    openrouter?: string;
    gemini?: string;
    groq?: string;
    tavily?: string;
    exa?: string;
    jina?: string;
    firecrawl?: string;
    github?: string;
    supabaseUrl?: string;
    supabaseSecret?: string;
    blockscout?: string;
    ankr?: string;
    alchemy?: string;
    nodereal?: string;
    coingecko?: string;
    codex?: string;
    helius?: string;
  };
  /** Explicit model overrides. Empty means: pick from the live model catalog. */
  models: {
    openrouter?: string;
    openrouterComplex?: string;
    openrouterLight?: string;
    gemini?: string;
    groq?: string;
  };
  urls: {
    github: string;
  };
  /** Pact Onchain: served on its own host; hidden elsewhere unless preview is on. */
  onchain: {
    host: string;
    preview: boolean;
  };
  // Kept for callers written against the Phase 2 shape.
  maxAgentSteps: number;
  maxToolCalls: number;
  toolTimeoutMs: number;
  runTimeoutMs: number;
  maxUploadBytes: number;
}

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function key(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

let cached: ServerConfig | null = null;

export function getConfig(): ServerConfig {
  if (cached) return cached;
  const env = process.env;
  const limits = {
    maxAgentSteps: int(env.MAX_AGENT_STEPS, 12, 1, 50),
    maxToolCalls: int(env.MAX_TOOL_CALLS, 10, 1, 40),
    toolTimeoutMs: int(env.TOOL_TIMEOUT_MS, 25_000, 1_000, 180_000),
    runTimeoutMs: int(env.RUN_TIMEOUT_MS, 240_000, 5_000, 900_000),
    maxUploadBytes: int(env.MAX_UPLOAD_BYTES, 10 * 1024 * 1024, 1024, 100 * 1024 * 1024),
    maxSearchResults: int(env.MAX_SEARCH_RESULTS, 5, 1, 10),
    maxSourceChars: int(env.MAX_SOURCE_LENGTH, 12_000, 500, 100_000),
    maxContextChars: int(env.MAX_CONTEXT_LENGTH, 60_000, 2_000, 400_000),
    maxCrawlPages: int(env.MAX_CRAWL_PAGES, 5, 1, 20),
    parserTimeoutMs: int(env.PARSER_TIMEOUT_MS, 30_000, 1_000, 180_000),
    llmTimeoutMs: int(env.LLM_TIMEOUT_MS, 90_000, 5_000, 300_000),
  };
  const storageEnv = env.PACT_STORAGE?.trim();
  cached = {
    mode: env.PACT_MODE === "production" ? "production" : "development",
    limits,
    storage: storageEnv === "supabase" || storageEnv === "file" || storageEnv === "memory" ? storageEnv : "auto",
    dataDir: env.PACT_DATA_DIR?.trim() || ".pact-data",
    keys: {
      openrouter: key(env.OPENROUTER_API_KEY),
      gemini: key(env.GEMINI_API_KEY),
      groq: key(env.GROQ_API_KEY),
      tavily: key(env.TAVILY_API_KEY),
      exa: key(env.EXA_API_KEY),
      jina: key(env.JINA_API_KEY),
      firecrawl: key(env.FIRECRAWL_API_KEY),
      github: key(env.GITHUB_TOKEN),
      supabaseUrl: key(env.SUPABASE_URL),
      supabaseSecret: key(env.SUPABASE_SECRET_KEY) ?? key(env.SUPABASE_SERVICE_ROLE_KEY),
      blockscout: key(env.BLOCKSCOUT_API_KEY),
      ankr: key(env.ANKR_API_KEY),
      alchemy: key(env.ALCHEMY_API_KEY),
      nodereal: key(env.NODEREAL_API_KEY),
      coingecko: key(env.COINGECKO_API_KEY),
      codex: key(env.CODEX_API_KEY),
      helius: key(env.HELIUS_API_KEY),
    },
    models: {
      openrouter: key(env.OPENROUTER_MODEL),
      openrouterComplex: key(env.OPENROUTER_MODEL_COMPLEX),
      openrouterLight: key(env.OPENROUTER_MODEL_LIGHT),
      gemini: key(env.GEMINI_MODEL),
      groq: key(env.GROQ_MODEL),
    },
    urls: {
      github: (env.GITHUB_API_URL?.trim() || "https://api.github.com").replace(/\/+$/, ""),
    },
    onchain: {
      host: (env.ONCHAIN_HOST?.trim() || "onchain.runpact.family").toLowerCase(),
      preview: env.PACT_ONCHAIN_PREVIEW === "1" || env.PACT_ONCHAIN_PREVIEW === "true",
    },
    maxAgentSteps: limits.maxAgentSteps,
    maxToolCalls: limits.maxToolCalls,
    toolTimeoutMs: limits.toolTimeoutMs,
    runTimeoutMs: limits.runTimeoutMs,
    maxUploadBytes: limits.maxUploadBytes,
  };
  return cached;
}

/** Test hook: forget the cached config so a changed environment is re-read. */
export function resetConfig() {
  cached = null;
}
