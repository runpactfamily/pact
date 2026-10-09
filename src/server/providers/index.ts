import { getConfig } from "../config";
import { FirecrawlProvider } from "./crawl/firecrawl";
import { GitHubApiProvider } from "./github/githubApi";
import { DefaultLLMPool } from "./llm/pool";
import { JinaReaderProvider } from "./reader/jina";
import { ReaderRouter } from "./reader/router";
import { ExaProvider } from "./search/exa";
import { SearchRouter } from "./search/router";
import { TavilyProvider } from "./search/tavily";
import type { Providers, ProviderStatus, ReaderProvider, SearchProvider } from "./types";

// Provider factory. Each interface gets a router over whichever vendors have
// credentials, in priority order. A missing key yields a status entry, never
// a throw, so the app starts with any subset of credentials. Nothing here is
// ever simulated: an unavailable provider is reported, not replaced.
//
// To add a vendor: implement the interface in its own file, then add it to
// the right chain here. Tools and the agent do not change.

export function createProviders(overrides: Partial<Providers> = {}): Providers {
  const config = getConfig();
  const { keys, urls } = config;
  const status: ProviderStatus[] = [];
  const missing = (...names: string[]) => `${names.join(", ")} ${names.length === 1 ? "is" : "are"} not set`;

  // LLM: a pool that routes by task tier (OpenRouter/Claude for heavy work, Groq/Gemini for light work).
  const pool = keys.openrouter || keys.gemini || keys.groq ? new DefaultLLMPool(keys, config.models) : null;
  const llm = overrides.llm !== undefined ? overrides.llm : pool;
  status.push({
    name: "llm",
    vendor: llm?.vendors[0] ?? null,
    available: llm !== null,
    chain: llm?.vendors ?? [],
    reason: llm ? undefined : missing("OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY"),
  });

  // Search: Tavily → Exa.
  const searchChain: SearchProvider[] = [];
  if (keys.tavily) searchChain.push(new TavilyProvider(keys.tavily));
  if (keys.exa) searchChain.push(new ExaProvider(keys.exa));
  const search = overrides.search !== undefined ? overrides.search : searchChain.length ? new SearchRouter(searchChain) : null;
  status.push({
    name: "search",
    vendor: search?.vendor ?? null,
    available: search !== null,
    chain: search instanceof SearchRouter ? search.vendors : search ? [search.vendor] : [],
    reason: search ? undefined : missing("TAVILY_API_KEY", "EXA_API_KEY"),
  });

  // Reader: Jina → Firecrawl scrape. Crawl: Firecrawl only.
  const firecrawl = keys.firecrawl ? new FirecrawlProvider(keys.firecrawl) : null;
  const readerChain: ReaderProvider[] = [];
  if (keys.jina) readerChain.push(new JinaReaderProvider(keys.jina));
  if (firecrawl) readerChain.push(firecrawl);
  const reader = overrides.reader !== undefined ? overrides.reader : readerChain.length ? new ReaderRouter(readerChain) : null;
  status.push({
    name: "reader",
    vendor: reader?.vendor ?? null,
    available: reader !== null,
    chain: reader instanceof ReaderRouter ? reader.vendors : reader ? [reader.vendor] : [],
    reason: reader ? undefined : missing("JINA_API_KEY", "FIRECRAWL_API_KEY"),
  });

  const crawl = overrides.crawl !== undefined ? overrides.crawl : firecrawl;
  status.push({ name: "crawl", vendor: crawl?.vendor ?? null, available: crawl !== null, chain: crawl ? [crawl.vendor] : [], reason: crawl ? undefined : missing("FIRECRAWL_API_KEY") });

  const github = overrides.github !== undefined ? overrides.github : keys.github ? new GitHubApiProvider(keys.github, urls.github) : null;
  status.push({ name: "github", vendor: github?.vendor ?? null, available: github !== null, chain: github ? [github.vendor] : [], reason: github ? undefined : missing("GITHUB_TOKEN") });

  const supabase = Boolean(keys.supabaseUrl && keys.supabaseSecret);
  status.push({
    name: "database",
    vendor: supabase ? "supabase" : "file",
    available: true,
    reason: supabase ? undefined : "SUPABASE_URL / SUPABASE_SECRET_KEY are not set; runs are kept as local files",
  });

  return { llm, search, reader, crawl, github, status };
}

/** Flat availability map for /api/health: every vendor, true/false, never a secret. */
export function vendorAvailability(): Record<string, boolean> {
  const { keys } = getConfig();
  return {
    openrouter: Boolean(keys.openrouter),
    gemini: Boolean(keys.gemini),
    groq: Boolean(keys.groq),
    tavily: Boolean(keys.tavily),
    exa: Boolean(keys.exa),
    jina: Boolean(keys.jina),
    firecrawl: Boolean(keys.firecrawl),
    github: Boolean(keys.github),
    supabase: Boolean(keys.supabaseUrl && keys.supabaseSecret),
  };
}

let shared: Providers | null = null;

export function getProviders(): Providers {
  if (!shared) shared = createProviders();
  return shared;
}

/** Test hook. */
export function setProviders(providers: Providers | null) {
  shared = providers;
}
