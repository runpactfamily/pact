import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContext } from "../src/server/agent/context";
import { planFromRules } from "../src/server/agent/planner";
import { classifyTask, OUTPUT_TOKENS, routeTask } from "../src/server/agent/taskRouter";
import { compareVersions, pickClaude, pickGemini, pickGroq, resetCatalog } from "../src/server/providers/llm/catalog";
import { DefaultLLMPool, TIER_ORDER } from "../src/server/providers/llm/pool";
import type { ModelInfo } from "../src/server/providers/types";
import type { RunRecord } from "../src/server/runs/types";
import { stubFetch } from "./helpers";

function run(job: string, attachments: RunRecord["attachments"] = []): RunRecord {
  return { id: "run_t", userId: "u", title: job, job, attachments, status: "queued", stage: "understanding", createdAt: 0, steps: [], toolCalls: [], activity: [], sources: [], selection: { mode: "auto" } };
}

const tierOf = (job: string, attachments: RunRecord["attachments"] = []) => {
  const ctx = buildContext(run(job, attachments));
  return routeTask(ctx, planFromRules(ctx)).tier;
};

test("task router: light for trivial text work, heavy for research/code, complex for deep multi-source jobs", () => {
  assert.equal(tierOf("Rewrite this paragraph in a professional tone."), "light");
  assert.equal(tierOf("Write a short tweet about our launch."), "light");
  assert.equal(tierOf("Explain how Pact could analyze a PDF."), "light");
  assert.equal(tierOf("Summarize this document and extract the 10 most important findings.", [{ id: "a", kind: "file", label: "brief.pdf", fileId: "file_abc123" }]), "medium");
  assert.equal(tierOf("Find the top 5 trends in this dataset.", [{ id: "a", kind: "file", label: "sales.csv", fileId: "file_abc123" }]), "heavy");
  assert.equal(tierOf("Understand this repository and explain its architecture.", [{ id: "a", kind: "github", label: "acme/app" }]), "heavy");
  assert.equal(tierOf("Research the current AI agent landscape and compare the strongest approaches."), "heavy");
  assert.equal(
    tierOf("Research the current AI agent market, compare 10 companies in depth and write a comprehensive report with sources.", [
      { id: "a", kind: "file", label: "notes.pdf", fileId: "file_abc123" },
      { id: "b", kind: "link", label: "example.com", detail: "https://example.com" },
    ]),
    "complex",
  );
  assert.ok(OUTPUT_TOKENS.light < OUTPUT_TOKENS.heavy);
  assert.equal(classifyTask({ jobChars: 10, files: 0, tabular: 0, repos: 0, links: 0, tools: 0, research: false, crawl: false, comparison: false, depth: false, longOutput: false, multiStep: false, trivial: false, onchain: false }), "light");
});

const catalogModels: ModelInfo[] = [
  { vendor: "openrouter", id: "anthropic/claude-opus-9", name: "Claude Opus 9", family: "claude" },
  { vendor: "openrouter", id: "anthropic/claude-sonnet-9", name: "Claude Sonnet 9", family: "claude" },
  { vendor: "openrouter", id: "anthropic/claude-haiku-9", name: "Claude Haiku 9", family: "claude" },
  { vendor: "openrouter", id: "meta/llama:free", name: "Llama", family: "free" },
  { vendor: "gemini", id: "gemini-9.1-flash", name: "Gemini 9.1 Flash", family: "gemini" },
  { vendor: "gemini", id: "gemini-9.1-flash-lite", name: "Gemini 9.1 Flash Lite", family: "gemini" },
  { vendor: "gemini", id: "gemini-9.2-flash-preview", name: "Gemini 9.2 Flash Preview", family: "gemini" },
  { vendor: "groq", id: "openai/gpt-oss-120b", name: "gpt-oss-120b", family: "openai", contextLength: 131072 },
  { vendor: "groq", id: "openai/gpt-oss-20b", name: "gpt-oss-20b", family: "openai", contextLength: 131072 },
];

test("catalog picks: current Sonnet/Opus/Haiku, stable Gemini flash, strongest Groq model", () => {
  assert.equal(pickClaude(catalogModels, "sonnet")?.id, "anthropic/claude-sonnet-9");
  assert.equal(pickClaude(catalogModels, "opus")?.id, "anthropic/claude-opus-9");
  assert.equal(pickClaude(catalogModels, "haiku")?.id, "anthropic/claude-haiku-9");
  assert.equal(pickGemini(catalogModels)?.id, "gemini-9.1-flash", "stable flash over lite and preview");
  assert.equal(pickGroq(catalogModels)?.id, "openai/gpt-oss-120b");
  assert.ok(compareVersions("gemini-3.8-flash", "gemini-3.5-flash") > 0);
  assert.ok(compareVersions("gemini-3.8-flash", "gemini-3.8-flash-preview") > 0);
});

test("llm pool: auto routing by tier uses the live catalog; manual selection is exact and validated", async () => {
  resetCatalog();
  const keys = { openrouter: "a", gemini: "b", groq: "c" };
  const fetchers = {
    openrouter: async () => catalogModels.filter((m) => m.vendor === "openrouter"),
    gemini: async () => catalogModels.filter((m) => m.vendor === "gemini"),
    groq: async () => catalogModels.filter((m) => m.vendor === "groq"),
  };
  const pool = new DefaultLLMPool(keys, {}, fetchers);
  assert.deepEqual(pool.vendors, ["openrouter", "gemini", "groq"]);
  assert.deepEqual(TIER_ORDER.light, ["groq", "gemini", "openrouter"]);

  const heavy = await pool.resolve({ mode: "auto" }, "heavy");
  assert.equal(heavy.routing.vendor, "openrouter");
  assert.equal(heavy.routing.model, "anthropic/claude-sonnet-9");
  assert.deepEqual(heavy.routing.chain, ["openrouter:anthropic/claude-sonnet-9", "gemini:gemini-9.1-flash", "groq:openai/gpt-oss-120b"]);

  const complex = await pool.resolve({ mode: "auto" }, "complex");
  assert.equal(complex.routing.model, "anthropic/claude-opus-9");

  const light = await pool.resolve({ mode: "auto" }, "light");
  assert.equal(light.routing.vendor, "groq");
  assert.equal(light.routing.chain[2], "openrouter:anthropic/claude-haiku-9", "OpenRouter is the last resort for light work, with the cheap model");

  const manual = await pool.resolve({ mode: "manual", provider: "gemini", model: "gemini-9.2-flash-preview" }, "heavy");
  assert.equal(manual.routing.mode, "manual");
  assert.deepEqual(manual.routing.chain, ["gemini:gemini-9.2-flash-preview"], "no cross-vendor fallback for a manual choice");
  await assert.rejects(pool.resolve({ mode: "manual", provider: "gemini", model: "gemini-made-up" }, "heavy"), /not an available gemini model/);

  const overridden = new DefaultLLMPool(keys, { openrouter: "anthropic/claude-sonnet-9", openrouterComplex: "anthropic/claude-opus-9", gemini: "gemini-9.1-flash" }, fetchers);
  assert.equal((await overridden.resolve({ mode: "auto" }, "medium")).routing.model, "gemini-9.1-flash");

  const partial = new DefaultLLMPool({ groq: "c" }, {}, { openrouter: null, gemini: null, groq: fetchers.groq });
  const only = await partial.resolve({ mode: "auto" }, "heavy");
  assert.deepEqual(only.routing.chain, ["groq:openai/gpt-oss-120b"], "only configured vendors appear in the chain");
  await assert.rejects(partial.resolve({ mode: "manual", provider: "openrouter", model: "x" }, "heavy"), /not configured/);
  resetCatalog();
});

test("catalog: vendor lists are fetched from the real endpoints and normalised; failures keep going", async () => {
  resetCatalog();
  const stub = stubFetch({
    "openrouter.ai/api/v1/models": () => ({ json: { data: [{ id: "anthropic/claude-sonnet-9", name: "Anthropic: Claude Sonnet 9", created: 2, context_length: 1000000, pricing: { prompt: "0.000002", completion: "0.00001" } }, { id: "anthropic/claude-sonnet-9:batch", created: 2 }, { id: "x/y:free", name: "Y", created: 1, pricing: { prompt: "0", completion: "0" } }] } }),
    "generativelanguage.googleapis.com": () => ({ json: { models: [{ name: "models/gemini-9-flash", displayName: "Gemini 9 Flash", inputTokenLimit: 1000, supportedGenerationMethods: ["generateContent"] }, { name: "models/gemini-9-flash-image", supportedGenerationMethods: ["generateContent"] }, { name: "models/embedding-1", supportedGenerationMethods: ["embedContent"] }] } }),
    "api.groq.com/openai/v1/models": () => ({ status: 500, json: {} }),
  });
  try {
    const { fetchGeminiModels, fetchOpenRouterModels, loadCatalog } = await import("../src/server/providers/llm/catalog");
    const or = await fetchOpenRouterModels("k");
    assert.deepEqual(or.map((m) => m.id), ["anthropic/claude-sonnet-9", "x/y:free"], "batch variants are dropped, newest first");
    assert.deepEqual(or[0].pricing, { input: 2, output: 10 });
    assert.equal(or[0].name, "Claude Sonnet 9");
    const ge = await fetchGeminiModels("k");
    assert.deepEqual(ge.map((m) => m.id), ["gemini-9-flash"], "image and embedding models are excluded");
    const catalog = await loadCatalog({ openrouter: () => fetchOpenRouterModels("k"), gemini: () => fetchGeminiModels("k"), groq: async () => { throw new Error("down"); } });
    assert.equal(catalog.vendors.find((v) => v.vendor === "groq")?.models.length, 0);
    assert.match(catalog.vendors.find((v) => v.vendor === "groq")?.reason ?? "", /could not be fetched/);
    assert.equal(catalog.vendors.find((v) => v.vendor === "openrouter")?.models.length, 2);
    assert.ok(!JSON.stringify(catalog).includes('"k"'));
  } finally {
    stub.restore();
    resetCatalog();
  }
});
