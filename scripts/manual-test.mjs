// Drives the running server through the real API with real credentials.
// node scripts/manual-test.mjs [baseUrl] [fixturesDir] [tests e.g. A,C,F]
import { readFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3100";
const FIX = process.argv[3] ?? ".pact-data/fixtures";
const USER = `manual-${Date.now().toString(36)}`;
const headers = { "x-pact-user": USER };

async function upload(name) {
  const bytes = await readFile(path.join(FIX, name));
  const form = new FormData();
  form.append("file", new Blob([bytes]), name);
  const r = await fetch(`${BASE}/api/files`, { method: "POST", body: form, headers });
  const body = await r.json();
  if (!r.ok) throw new Error(`upload ${name}: ${JSON.stringify(body)}`);
  return body.attachment;
}

async function runJob(label, task, attachments = [], model) {
  const started = Date.now();
  const created = await fetch(`${BASE}/api/runs`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ task, attachments, model }) });
  const body = await created.json();
  if (!created.ok) {
    console.log(`\n=== ${label} → rejected ${JSON.stringify(body.error)}`);
    return null;
  }
  const { run } = body;
  let final;
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    final = (await (await fetch(`${BASE}/api/runs/${run.id}`, { headers })).json()).run;
    if (["completed", "failed", "cancelled"].includes(final.status)) break;
    if (Date.now() - started > 300_000) throw new Error("timeout");
  }
  const steps = await (await fetch(`${BASE}/api/runs/${run.id}/steps`, { headers })).json();
  const tools = steps.toolCalls.map((c) => `${c.tool}:${c.status}${c.output?.source ? `(${c.output.source})` : ""}${c.output?.provider ? `(${c.output.provider})` : ""}`);
  const plan = steps.steps.find((s) => s.type === "plan")?.output ?? {};
  const synth = steps.steps.find((s) => s.type === "synthesize")?.output ?? {};
  console.log(`\n=== ${label} (${((Date.now() - started) / 1000).toFixed(1)}s) → ${final.status}${final.error ? ` ${final.error.code}: ${final.error.message}` : ""}`);
  console.log(`routing: ${final.routing ? `${final.routing.mode}/${final.routing.tier} → ${final.routing.chain.join(" → ")}` : "none"}`);
  console.log(`did the work: ${final.llm ? `${final.llm.label} (${final.llm.vendor} / ${final.llm.model})` : "none"} | plan via ${plan.provider ?? "rules"}${plan.failovers ? ` (failovers ${plan.failovers})` : ""} | synth ${synth.provider ?? "?"} ${synth.model ?? ""}${synth.failovers ? ` (failovers ${synth.failovers})` : ""} ctx=${synth.contextChars ?? "?"} chars`);
  console.log(`tools: ${tools.join(", ") || "none"}`);
  console.log(`sources: ${(final.sources ?? []).length} → ${(final.sources ?? []).slice(0, 3).map((s) => `${s.provider}:${s.url ?? s.title}`).join(" | ")}`);
  if (final.result) {
    console.log(`title: ${final.result.title}`);
    console.log(`summary: ${final.result.summary.slice(0, 300)}`);
    for (const s of final.result.sections.slice(0, 5)) console.log(`  - ${s.heading}${s.tone ? ` [${s.tone}]` : ""}: ${(s.items ?? s.body ?? []).slice(0, 2).join(" / ").slice(0, 180)}${s.table ? ` [table ${s.table.rows.length} rows]` : ""}`);
  }
  return final;
}

const only = (process.argv[4] ?? "").split(",").filter(Boolean);
const want = (n) => !only.length || only.includes(n);

const health = await (await fetch(`${BASE}/api/health`)).json();
console.log(`health: ${health.status} mode=${health.mode} storage=${health.storage} providers=${JSON.stringify(health.providers)}`);
const models = await (await fetch(`${BASE}/api/models`)).json();
for (const v of models.vendors) console.log(`  models/${v.vendor}: ${v.available ? v.models.slice(0, 4).map((m) => m.id).join(", ") : `unavailable (${v.reason})`}`);

if (want("A")) await runJob("TEST A — rewrite (expect light)", "Rewrite this paragraph in a professional tone: hey so basically we shipped the thing late because the vendor flaked, sorry about that, we'll do better next time.");
if (want("B")) await runJob("TEST B — explain (expect light)", "Explain how Pact could analyze a PDF.");
if (want("C")) await runJob("TEST C — research (expect heavy, OpenRouter + web)", "Research the current AI agent landscape and compare the strongest approaches.");
if (want("D")) await runJob("TEST D — PDF", "Summarize this document and extract the 10 most important findings.", [await upload("brief.pdf")]);
if (want("E")) await runJob("TEST E — CSV (expect analysis + model)", "Find the top 5 trends in this dataset.", [await upload("sales.csv")]);
if (want("F")) await runJob("TEST F — GitHub (expect heavy, Claude)", "Understand this repository and explain its architecture.", [{ id: "g1", kind: "github", label: "expressjs/express" }]);
if (want("G")) await runJob("TEST G — manual Gemini", "Write a short tweet about launching Pact.", [], { mode: "manual", provider: "gemini", model: models.vendors.find((v) => v.vendor === "gemini")?.models[0]?.id });
if (want("H")) await runJob("TEST H — manual Groq", "Write a short tweet about launching Pact.", [], { mode: "manual", provider: "groq", model: models.vendors.find((v) => v.vendor === "groq")?.models[0]?.id });
if (want("W")) await runJob("TEST W — crawl (expect web_crawl via firecrawl)", "Explore the entire site and tell me what it is for.", [{ id: "l1", kind: "link", label: "example.com", detail: "https://example.com" }]);
if (want("X")) await runJob("TEST X — DOCX + XLSX", "Compare the two quarters in this workbook and summarise the review.", [await upload("review.docx"), await upload("sales.xlsx")]);
