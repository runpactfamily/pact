import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContext, searchQueryFor } from "../src/server/agent/context";
import { assembleContext, trimToRelevant } from "../src/server/agent/contextManager";
import { mergePlans, planFromRules } from "../src/server/agent/planner";
import type { RunRecord } from "../src/server/runs/types";
import type { Evidence } from "../src/server/tools/types";

function run(job: string, attachments: RunRecord["attachments"] = []): RunRecord {
  return { id: "run_t", userId: "u", title: job, job, attachments, status: "queued", stage: "understanding", createdAt: 0, steps: [], toolCalls: [], activity: [], sources: [], selection: { mode: "auto" } };
}

test("tool selection: only what the job needs", () => {
  assert.deepEqual(planFromRules(buildContext(run("Write me a short announcement about our new office."))), [], "writing needs no tools");
  const research = planFromRules(buildContext(run("Research the latest information about electric ferries and summarize the key points with sources.")));
  assert.deepEqual(research.map((s) => s.tool), ["web_search"]);
  assert.equal(research[0].input.query, "electric ferries");
  const pdf = planFromRules(buildContext(run("Summarize this document.", [{ id: "a", kind: "file", label: "brief.pdf", fileId: "file_abc123" }])));
  assert.deepEqual(pdf.map((s) => s.tool), ["file_read"]);
  const csv = planFromRules(buildContext(run("Analyze this dataset and identify the most important trends.", [{ id: "a", kind: "file", label: "sales.csv", fileId: "file_abc123" }])));
  assert.deepEqual(csv.map((s) => s.tool), ["file_read", "data_analyze"]);
  const repo = planFromRules(buildContext(run("Understand how authentication works in this repository.", [{ id: "a", kind: "github", label: "acme/app" }])));
  assert.deepEqual(repo.map((s) => s.tool), ["github"]);
  assert.equal(repo[0].input.query, "Understand how authentication works in this repository.");
  const crawl = planFromRules(buildContext(run("Explore the entire site and tell me what they sell.", [{ id: "a", kind: "link", label: "shop.example", detail: "https://shop.example" }])));
  assert.deepEqual(crawl.map((s) => s.tool), ["web_crawl"]);
  const read = planFromRules(buildContext(run("What does this page say?", [{ id: "a", kind: "link", label: "shop.example", detail: "https://shop.example" }])));
  assert.deepEqual(read.map((s) => s.tool), ["web_read"]);
  const semantic = planFromRules(buildContext(run("Find papers about similar to retrieval augmented generation.")));
  assert.equal(semantic[0].input.mode, "semantic");
});

test("search query strips instruction words", () => {
  assert.equal(searchQueryFor("Research the latest information about solid-state batteries and summarize the key points with sources."), "solid-state batteries");
});

test("merging keeps attachment reads and lets the model decide on research", () => {
  const rules = [{ tool: "file_read", input: { fileId: "f1" }, label: "r" }, { tool: "web_search", input: { query: "x" }, label: "s" }];
  const model = [{ tool: "calculator", input: { expression: "1+1" }, label: "c" }];
  assert.deepEqual(mergePlans(rules, model, 10).map((s) => s.tool), ["file_read", "calculator"], "model proposed no search, so the rule search is dropped");
  assert.deepEqual(mergePlans(rules, [], 10).map((s) => s.tool), ["file_read", "web_search"], "with no model plan the rule plan stands");
  assert.equal(mergePlans(rules, model, 1).length, 1);
  const many = Array.from({ length: 4 }, (_, i) => ({ tool: "web_search", input: { query: `q${i}` }, label: "s" }));
  assert.equal(mergePlans([], many, 10).filter((s) => s.tool === "web_search").length, 2, "at most two searches per run");
  const crawlRules = [{ tool: "web_crawl", input: { url: "https://example.com" }, label: "c" }];
  const crawlModel = [{ tool: "web_crawl", input: { url: "https://example.com/", maxPages: 3 }, label: "c" }];
  assert.equal(mergePlans(crawlRules, crawlModel, 10).length, 1, "the same site is not crawled twice");
});

test("context manager: dedupes, ranks user material first, trims to relevant paragraphs and caps the total", () => {
  const long = Array.from({ length: 40 }, (_, i) => (i === 25 ? "The espresso machine market in Jakarta grew sharply." : `Paragraph ${i} about something unrelated entirely.`)).join("\n\n");
  const evidence: Evidence[] = [
    { kind: "search", label: "s1", url: "https://a.example/p?utm=1", text: "espresso snippet" },
    { kind: "search", label: "s1-dup", url: "https://a.example/p", text: "duplicate by url" },
    { kind: "page", label: "page", url: "https://b.example", text: long },
    { kind: "file", label: "brief.txt", text: "Our file about espresso machines." },
    { kind: "table", label: "t", text: "rows" },
  ];
  const ctx = assembleContext(evidence, ["espresso", "jakarta"], { maxSourceChars: 300, maxContextChars: 600 });
  assert.equal(ctx.dropped >= 1, true, "duplicate url dropped");
  assert.equal(ctx.items[0].kind, "table");
  assert.equal(ctx.items[1].kind, "file");
  assert.ok(ctx.chars <= 600);
  const page = ctx.items.find((i) => i.kind === "page");
  assert.ok(page && page.chars <= 300 && page.text.includes("Jakarta grew sharply"), "the relevant paragraph survives trimming");
  assert.ok(ctx.items.every((i, n) => i.ref === n + 1));
  assert.equal(trimToRelevant("short", ["x"], 100), "short");
});
