import "./setup";
import { resetConfig } from "../src/server/config";
import { createProviders, setProviders } from "../src/server/providers";
import type { LLMPool, LLMProvider, ModelCatalog, ModelSelection, Providers, ReaderProvider, SearchProvider, TaskTier } from "../src/server/providers/types";
import { RunManager, setRunManager } from "../src/server/runs/manager";
import { MemoryStorage } from "../src/server/storage/memory";
import { setStorage } from "../src/server/storage";
import { createDefaultRegistry } from "../src/server/tools/registry";

/** Fresh storage, config, providers and manager for one test. */
export function fresh(overrides: Partial<Providers> = {}, env: Record<string, string> = {}) {
  for (const key of ["MAX_AGENT_STEPS", "MAX_TOOL_CALLS", "PACT_MODE", "TOOL_TIMEOUT_MS", "RUN_TIMEOUT_MS", "MAX_UPLOAD_BYTES"]) delete process.env[key];
  Object.assign(process.env, { PACT_MODE: "development" }, env);
  resetConfig();
  const storage = new MemoryStorage();
  setStorage(storage);
  const providers = createProviders(overrides);
  setProviders(providers);
  const registry = createDefaultRegistry();
  const manager = new RunManager(() => ({ providers, registry }));
  setRunManager(manager);
  return { storage, providers, registry, manager };
}

export const fakeSearch: SearchProvider = {
  vendor: "fake-search",
  async search(query) {
    return [
      { title: `Result one for ${query}`, url: "https://example.com/one", snippet: "Espresso machine demand in Jakarta rose eighteen percent this year according to distributors.", source: "fake-search" },
      { title: "Result two", url: "https://example.com/two", snippet: "Servicing and parts availability matter more than brand to café buyers.", source: "fake-search" },
    ];
  },
};

export const fakeReader: ReaderProvider = {
  vendor: "fake-reader",
  async read(url) {
    const content = "Independent cafés are the growth engine of the refurbished espresso market. Pricing is opaque and varies by thirty percent. Supply is the main constraint for sellers.";
    return { url, title: `Page at ${url}`, content, metadata: { provider: "fake-reader", chars: content.length, retrievedAt: new Date().toISOString() } };
  },
};

/** Wraps a scripted provider in the pool interface the engine expects. Records what tier it was asked for. */
export function fakePool(provider: LLMProvider, catalog?: ModelCatalog): LLMPool & { calls: { selection: ModelSelection; tier: TaskTier }[] } {
  const calls: { selection: ModelSelection; tier: TaskTier }[] = [];
  return {
    vendors: ["openrouter", "gemini", "groq"],
    calls,
    async catalog() {
      return catalog ?? { fetchedAt: Date.now(), vendors: [] };
    },
    async resolve(selection, tier) {
      calls.push({ selection, tier });
      const vendor = selection.mode === "manual" ? selection.provider : tier === "light" ? "groq" : tier === "medium" ? "gemini" : "openrouter";
      const model = selection.mode === "manual" ? selection.model : provider.model;
      return { provider, routing: { mode: selection.mode, tier, vendor, model, chain: [`${vendor}:${model}`] } };
    },
  };
}

/** A pool whose only model always fails: the run must fail, never invent a result. */
export const downPool: LLMPool = {
  vendors: ["openrouter"],
  async catalog() {
    return { fetchedAt: Date.now(), vendors: [] };
  },
  async resolve(selection, tier) {
    const { PactError } = await import("../src/server/errors");
    const provider: LLMProvider = {
      vendor: "openrouter",
      model: "down",
      async generate() {
        throw new PactError("AGENT_PROVIDER_UNAVAILABLE", "Unable to complete this run because the available reasoning providers are unavailable.");
      },
    };
    return { provider, routing: { mode: selection.mode, tier, vendor: "openrouter", model: "down", chain: ["openrouter:down"] } };
  },
};

/** A scripted model that plans nothing and writes a minimal valid result. */
export function simpleLLM(): LLMProvider {
  return fakeLLM((prompt) =>
    prompt.includes("You plan work")
      ? JSON.stringify({ goal: "do the job", deliverable: "summary", criteria: [], steps: [] })
      : JSON.stringify({ title: "Result", summary: "A short summary of what was found.", sections: [{ heading: "Findings", items: ["One finding."] }, { heading: "Important risks", tone: "risk", items: ["Thin evidence."] }], sources: [] }),
  );
}

export function fakeLLM(reply: (prompt: string) => string): LLMProvider {
  return {
    vendor: "fake-llm",
    model: "fake",
    async generate(options) {
      const prompt = options.messages.map((m) => m.content).join("\n");
      return { text: reply(prompt), vendor: "fake-llm", model: "fake", durationMs: 1 };
    },
  };
}

export function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

export interface StubCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

/** Replaces global fetch for one test. Each route returns status + JSON (or text). */
export function stubFetch(routes: Record<string, (call: StubCall) => { status?: number; json?: unknown; text?: string } | Promise<{ status?: number; json?: unknown; text?: string }>>) {
  const calls: StubCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers as Record<string, string>) ?? {})) headers[k.toLowerCase()] = v;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    const call = { url, method: init?.method ?? "GET", headers, body };
    calls.push(call);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response("not stubbed: " + url, { status: 599 });
    const out = await routes[key](call);
    const status = out.status ?? 200;
    if (out.text !== undefined) return new Response(out.text, { status, headers: { "content-type": "text/plain" } });
    return new Response(JSON.stringify(out.json ?? {}), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}
