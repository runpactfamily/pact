import { log } from "../../log";
import { fetchJson } from "../../utils/http";
import type { LLMVendor, ModelCatalog, ModelInfo } from "../types";

// Live model lists from each configured vendor, cached server-side. The
// frontend never talks to a vendor; it reads /api/models, which reads this.

const CACHE_MS = 60 * 60 * 1000;

interface OpenRouterModel {
  id: string;
  name?: string;
  created?: number;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { modality?: string; output_modalities?: string[] };
}

interface GeminiModel {
  name: string;
  displayName?: string;
  inputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

interface GroqModel {
  id: string;
  context_window?: number;
  active?: boolean;
}

const EXCLUDE_GEMINI = /image|tts|audio|transcribe|omni|live|embedding|banana|lyria|deep-research|customtools/i;
const EXCLUDE_GROQ = /whisper|guard|orpheus|allam|safeguard|tts/i;

function perMillion(value: string | undefined): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 1e6 * 100) / 100 : undefined;
}

export async function fetchOpenRouterModels(apiKey: string): Promise<ModelInfo[]> {
  const data = await fetchJson<{ data?: OpenRouterModel[] }>("https://openrouter.ai/api/v1/models", {
    provider: "OpenRouter",
    timeoutMs: 15_000,
    headers: { authorization: `Bearer ${apiKey}` },
  });
  return (data.data ?? [])
    .filter((m) => typeof m.id === "string")
    .filter((m) => !m.architecture?.output_modalities || m.architecture.output_modalities.includes("text"))
    .filter((m) => !m.id.endsWith(":batch"))
    .map((m) => ({
      vendor: "openrouter" as const,
      id: m.id,
      name: (m.name ?? m.id).replace(/^Anthropic:\s*/i, ""),
      contextLength: m.context_length,
      pricing: m.pricing ? { input: perMillion(m.pricing.prompt) ?? 0, output: perMillion(m.pricing.completion) ?? 0 } : undefined,
      family: m.id.startsWith("anthropic/claude") ? "claude" : m.id.endsWith(":free") ? "free" : m.id.split("/")[0],
      created: m.created ?? 0,
    }))
    .sort((a, b) => b.created - a.created)
    .map(({ created: _created, ...rest }) => {
      void _created;
      return rest;
    });
}

export async function fetchGeminiModels(apiKey: string): Promise<ModelInfo[]> {
  const data = await fetchJson<{ models?: GeminiModel[] }>(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(apiKey)}`, {
    provider: "Gemini",
    timeoutMs: 15_000,
  });
  return (data.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => ({ ...m, id: m.name.replace(/^models\//, "") }))
    .filter((m) => /^gemini-/.test(m.id) && !EXCLUDE_GEMINI.test(m.id))
    .map((m) => ({ vendor: "gemini" as const, id: m.id, name: m.displayName ?? m.id, contextLength: m.inputTokenLimit, family: "gemini" }))
    .sort((a, b) => compareVersions(b.id, a.id));
}

export async function fetchGroqModels(apiKey: string): Promise<ModelInfo[]> {
  const data = await fetchJson<{ data?: GroqModel[] }>("https://api.groq.com/openai/v1/models", {
    provider: "Groq",
    timeoutMs: 15_000,
    headers: { authorization: `Bearer ${apiKey}` },
  });
  return (data.data ?? [])
    .filter((m) => typeof m.id === "string" && m.active !== false && !EXCLUDE_GROQ.test(m.id) && (m.context_window ?? 0) >= 8192)
    .map((m) => ({ vendor: "groq" as const, id: m.id, name: m.id.split("/").pop() ?? m.id, contextLength: m.context_window, family: m.id.split("/")[0] }))
    .sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0) || a.id.localeCompare(b.id));
}

/** Compares version-like ids ("gemini-3.8-flash" > "gemini-3.5-flash"); stable builds beat previews. */
export function compareVersions(a: string, b: string): number {
  const num = (s: string) => Number(s.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const preview = (s: string) => (/preview|exp|latest/.test(s) ? 1 : 0);
  return num(a) - num(b) || preview(b) - preview(a);
}

// ---------- picks used by auto routing when no override is configured ----------

export function pickClaude(models: ModelInfo[], kind: "sonnet" | "opus" | "haiku"): ModelInfo | undefined {
  const claude = models.filter((m) => m.vendor === "openrouter" && m.family === "claude");
  const exact = claude.find((m) => m.id.includes(`claude-${kind}`) || m.id.includes(`${kind}-`));
  if (exact) return exact;
  if (kind === "haiku") return undefined;
  return claude[0];
}

export function pickGemini(models: ModelInfo[]): ModelInfo | undefined {
  const gemini = models.filter((m) => m.vendor === "gemini");
  return gemini.find((m) => /flash$/.test(m.id) && !/lite/.test(m.id)) ?? gemini.find((m) => /flash/.test(m.id)) ?? gemini[0];
}

export function pickGroq(models: ModelInfo[]): ModelInfo | undefined {
  const groq = models.filter((m) => m.vendor === "groq");
  return groq.find((m) => /gpt-oss-120b/.test(m.id)) ?? groq.find((m) => /120b|70b/.test(m.id)) ?? groq[0];
}

// ---------- cache ----------

type Fetchers = Record<LLMVendor, (() => Promise<ModelInfo[]>) | null>;

const g = globalThis as unknown as { __pactCatalog?: { value: ModelCatalog; promise?: Promise<ModelCatalog> } };

export async function loadCatalog(fetchers: Fetchers, force = false): Promise<ModelCatalog> {
  const cached = g.__pactCatalog;
  if (!force && cached?.value && Date.now() - cached.value.fetchedAt < CACHE_MS) return cached.value;
  if (!force && cached?.promise) return cached.promise;

  const promise = (async () => {
    const vendors: ModelCatalog["vendors"] = [];
    for (const vendor of ["openrouter", "gemini", "groq"] as LLMVendor[]) {
      const fetcher = fetchers[vendor];
      if (!fetcher) {
        vendors.push({ vendor, available: false, reason: "API key is not set", models: [] });
        continue;
      }
      try {
        vendors.push({ vendor, available: true, models: await fetcher() });
      } catch (error) {
        log.warn("catalog.fetch_failed", { provider: vendor, detail: error instanceof Error ? error.message : String(error) });
        // Keep whatever we had for this vendor rather than dropping it.
        const previous = cached?.value.vendors.find((v) => v.vendor === vendor);
        vendors.push(previous?.models.length ? previous : { vendor, available: true, reason: "Model list could not be fetched; configured defaults are used", models: [] });
      }
    }
    const value: ModelCatalog = { fetchedAt: Date.now(), vendors };
    g.__pactCatalog = { value };
    return value;
  })();
  g.__pactCatalog = { value: cached?.value ?? { fetchedAt: 0, vendors: [] }, promise };
  return promise;
}

/** Test hook. */
export function resetCatalog() {
  g.__pactCatalog = undefined;
}
