import type { ServerConfig } from "../../config";
import { PactError } from "../../errors";
import type { LLMPool, LLMProvider, LLMResolution, LLMVendor, ModelCatalog, ModelInfo, ModelSelection, TaskTier } from "../types";
import { fetchGeminiModels, fetchGroqModels, fetchOpenRouterModels, loadCatalog, pickClaude, pickGemini, pickGroq } from "./catalog";
import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { OpenRouterProvider } from "./openrouter";
import { LLMRouter } from "./router";

// Decides which model answers a run. AUTO follows the task tier; a manual
// choice is honoured exactly (no cross-vendor fallback) so the user gets
// the model they picked or a clear error.
//
//   light    Groq → Gemini → OpenRouter (cheap)
//   medium   Gemini → Groq → OpenRouter (Claude Sonnet)
//   heavy    OpenRouter (Claude Sonnet) → Gemini → Groq
//   complex  OpenRouter (Claude Opus if configured/available, else Sonnet) → Gemini → Groq

// Used only when a vendor's live list cannot be fetched. Overridable via env.
const LAST_RESORT = { openrouter: "anthropic/claude-sonnet-5.5", gemini: "gemini-3.5-flash", groq: "openai/gpt-oss-120b" } as const;

export const TIER_ORDER: Record<TaskTier, LLMVendor[]> = {
  light: ["groq", "gemini", "openrouter"],
  medium: ["gemini", "groq", "openrouter"],
  heavy: ["openrouter", "gemini", "groq"],
  complex: ["openrouter", "gemini", "groq"],
};

export class DefaultLLMPool implements LLMPool {
  readonly vendors: LLMVendor[];

  constructor(
    private readonly keys: ServerConfig["keys"],
    private readonly overrides: ServerConfig["models"],
    private readonly fetchers = {
      openrouter: keys.openrouter ? () => fetchOpenRouterModels(keys.openrouter!) : null,
      gemini: keys.gemini ? () => fetchGeminiModels(keys.gemini!) : null,
      groq: keys.groq ? () => fetchGroqModels(keys.groq!) : null,
    },
  ) {
    this.vendors = (["openrouter", "gemini", "groq"] as LLMVendor[]).filter((v) => Boolean(keys[v]));
  }

  catalog(): Promise<ModelCatalog> {
    return loadCatalog(this.fetchers);
  }

  private make(vendor: LLMVendor, model: string): LLMProvider {
    if (vendor === "openrouter") return new OpenRouterProvider(this.keys.openrouter!, model);
    if (vendor === "gemini") return new GeminiProvider(this.keys.gemini!, model);
    return new GroqProvider(this.keys.groq!, model);
  }

  /** The model AUTO uses for a vendor at a tier: env override, else the live catalog, else a last resort. */
  private autoModel(vendor: LLMVendor, tier: TaskTier, models: ModelInfo[]): string {
    if (vendor === "openrouter") {
      if (tier === "complex") return this.overrides.openrouterComplex ?? pickClaude(models, "opus")?.id ?? this.overrides.openrouter ?? pickClaude(models, "sonnet")?.id ?? LAST_RESORT.openrouter;
      if (tier === "light") return this.overrides.openrouterLight ?? pickClaude(models, "haiku")?.id ?? this.overrides.openrouter ?? pickClaude(models, "sonnet")?.id ?? LAST_RESORT.openrouter;
      return this.overrides.openrouter ?? pickClaude(models, "sonnet")?.id ?? LAST_RESORT.openrouter;
    }
    if (vendor === "gemini") return this.overrides.gemini ?? pickGemini(models)?.id ?? LAST_RESORT.gemini;
    return this.overrides.groq ?? pickGroq(models)?.id ?? LAST_RESORT.groq;
  }

  async resolve(selection: ModelSelection, tier: TaskTier): Promise<LLMResolution> {
    if (!this.vendors.length) throw new PactError("AGENT_PROVIDER_UNAVAILABLE", "No language model is configured.");
    const catalog = await this.catalog();
    const all = catalog.vendors.flatMap((v) => v.models);

    if (selection.mode === "manual") {
      if (!this.vendors.includes(selection.provider)) throw new PactError("INVALID_REQUEST", `${selection.provider} is not configured on this server.`);
      const listed = catalog.vendors.find((v) => v.vendor === selection.provider)?.models ?? [];
      const ok = listed.length === 0 || listed.some((m) => m.id === selection.model);
      if (!ok) throw new PactError("INVALID_REQUEST", `“${selection.model}” is not an available ${selection.provider} model.`);
      const provider = this.make(selection.provider, selection.model);
      return { provider, routing: { mode: "manual", tier, vendor: selection.provider, model: selection.model, chain: [`${selection.provider}:${selection.model}`] } };
    }

    const chain = TIER_ORDER[tier].filter((v) => this.vendors.includes(v)).map((v) => this.make(v, this.autoModel(v, tier, all)));
    const provider = chain.length === 1 ? chain[0] : new LLMRouter(chain);
    return {
      provider,
      routing: { mode: "auto", tier, vendor: chain[0].vendor as LLMVendor, model: chain[0].model, chain: chain.map((p) => `${p.vendor}:${p.model}`) },
    };
  }
}
