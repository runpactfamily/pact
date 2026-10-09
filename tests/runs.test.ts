import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ingestFile } from "../src/server/files/store";
import { validateRunInput } from "../src/server/runs/manager";
import { canTransition } from "../src/server/runs/types";
import { downPool, fakeLLM, fakePool, fakeReader, fakeSearch, fresh, simpleLLM } from "./helpers";

test("run state transitions are enforced", () => {
  assert.equal(canTransition("queued", "running"), true);
  assert.equal(canTransition("queued", "cancelled"), true);
  assert.equal(canTransition("running", "completed"), true);
  assert.equal(canTransition("running", "failed"), true);
  assert.equal(canTransition("completed", "running"), false);
  assert.equal(canTransition("failed", "completed"), false);
  assert.equal(canTransition("queued", "completed"), false);
});

test("run input is validated and sanitized", () => {
  assert.throws(() => validateRunInput({}), /Describe the job/);
  assert.throws(() => validateRunInput("nope"), /must be an object/);
  const input = validateRunInput({ task: "  Compare\u0000 these  ", attachments: [{ kind: "file", label: "a.pdf", fileId: "../x" }, { kind: "bogus", label: "x" }, { kind: "link", label: "example.com" }] });
  assert.equal(input.task, "Compare these");
  assert.equal(input.attachments.length, 2);
  assert.equal(input.attachments[0].fileId, undefined, "malformed file ids are dropped");
});

test("create run → queued → running → completed; unavailable tools are skipped with a reason, never faked", async () => {
  const pool = fakePool(simpleLLM());
  const { manager } = fresh({ llm: pool });
  const created = await manager.createRun("user-a", { task: "Research the latest market for refurbished espresso machines in Southeast Asia and summarize what matters.", attachments: [] });
  assert.equal(created.status, "queued");
  const done = await manager.waitFor(created.id, 10_000);
  assert.equal(done.status, "completed");
  assert.equal(done.stage, "done");
  assert.ok(done.startedAt && done.completedAt && done.completedAt >= done.startedAt);
  assert.ok(done.result);
  assert.equal(done.result!.title, "Result");
  assert.ok(done.steps.some((s) => s.type === "plan" && s.status === "completed"));
  assert.ok(done.steps.some((s) => s.type === "synthesize" && s.status === "completed"));
  // web_search was planned by rules but skipped because no search provider is configured.
  const search = done.steps.find((s) => s.type === "tool" && s.input?.tool === "web_search");
  assert.equal(search?.status, "skipped");
  assert.equal(search?.error?.code, "PROVIDER_UNAVAILABLE");
  assert.equal(done.routing?.mode, "auto");
  assert.ok(["heavy", "complex"].includes(done.routing?.tier ?? ""), "a research job is routed to the heavy tier");
  assert.equal(done.routing?.vendor, "openrouter", "routing names the vendor chosen for the tier");
  assert.equal(done.llm?.vendor, "fake-llm", "llm names the provider that actually answered");
  assert.equal((await manager.getRun(created.id, "user-b")), null, "runs are scoped to their owner");
});

test("no language model → the run fails with a clear error (no substitute result)", async () => {
  const { manager } = fresh({ llm: null });
  const run = await manager.createRun("user-a", { task: "Summarize this.", attachments: [] });
  const done = await manager.waitFor(run.id, 10_000);
  assert.equal(done.status, "failed");
  assert.equal(done.error?.code, "AGENT_PROVIDER_UNAVAILABLE");
  assert.equal(done.result, undefined);
});

test("every configured model failing → failed run, never a fake success", async () => {
  const { manager } = fresh({ llm: downPool });
  const run = await manager.createRun("user-a", { task: "Rewrite this paragraph in a professional tone.", attachments: [] });
  const done = await manager.waitFor(run.id, 10_000);
  assert.equal(done.status, "failed");
  assert.equal(done.error?.code, "AGENT_PROVIDER_UNAVAILABLE");
  assert.match(done.error?.message ?? "", /reasoning providers are unavailable/);
  assert.equal(done.result, undefined);
});

test("manual model selection is recorded and honoured", async () => {
  const pool = fakePool(simpleLLM());
  const { manager } = fresh({ llm: pool });
  const run = await manager.createRun("user-a", { task: "Rewrite this paragraph in a professional tone.", attachments: [], model: { mode: "manual", provider: "gemini", model: "gemini-x" } });
  const done = await manager.waitFor(run.id, 10_000);
  assert.equal(done.status, "completed");
  assert.deepEqual(done.selection, { mode: "manual", provider: "gemini", model: "gemini-x" });
  assert.equal(done.routing?.mode, "manual");
  assert.equal(done.routing?.model, "gemini-x");
  assert.equal(pool.calls[0].tier, "light");
});

test("agent loop uses search and reader evidence, records tool calls", async () => {
  const { manager } = fresh({ search: fakeSearch, reader: fakeReader, llm: fakePool(simpleLLM()) });
  const run = await manager.createRun("user-a", { task: "Research the market for refurbished espresso machines in Southeast Asia.", attachments: [] });
  const done = await manager.waitFor(run.id, 10_000);
  assert.equal(done.status, "completed");
  const tools = done.toolCalls.map((c) => c.tool);
  assert.ok(tools.includes("web_search"));
  assert.ok(tools.includes("web_read"), "evaluate step reads the top search results");
  assert.ok(done.toolCalls.every((c) => c.status === "completed" && typeof c.durationMs === "number"));
  assert.ok(done.result!.sources.some((s) => s.detail === "https://example.com/one"), "gathered sources are attached to the result");
  assert.ok(done.sources.length >= 2 && done.sources.every((s) => s.provider && s.provider !== "unknown"), "source records carry their provider");
});

test("model path: plan and synthesis come from the LLM, validated", async () => {
  const llm = fakeLLM((prompt) =>
    prompt.includes("You plan work")
      ? JSON.stringify({ goal: "Compare suppliers", deliverable: "comparison", criteria: ["price"], steps: [{ tool: "calculator", input: { expression: "100 * 1.06" }, why: "Price uplift" }, { tool: "shell", input: {} }] })
      : JSON.stringify({ title: "Supplier Comparison", summary: "Halden is the lower-risk option.", highlights: [{ value: "6%", label: "price gap" }], sections: [{ heading: "Important risks", tone: "risk", items: ["Single production line."] }, { heading: "Recommendation", tone: "recommendation", body: ["Choose Halden."] }], sources: [{ label: "Halden quote", detail: "page 2" }] }),
  );
  const { manager } = fresh({ llm: fakePool(llm) });
  const run = await manager.createRun("user-a", { task: "Compare these suppliers on price.", attachments: [] });
  const done = await manager.waitFor(run.id, 10_000);
  assert.equal(done.status, "completed");
  assert.equal(done.result!.title, "Supplier Comparison");
  assert.equal(done.toolCalls.length, 1, "the invented 'shell' tool was rejected");
  assert.equal(done.toolCalls[0].tool, "calculator");
  assert.ok(!done.result!.sources.some((s) => s.label === "Halden quote"), "a source the run never gathered is not cited");
});

test("tool execution limit is enforced and reported", async () => {
  const { manager } = fresh({ llm: fakePool(simpleLLM()) }, { MAX_TOOL_CALLS: "1", MAX_AGENT_STEPS: "12" });
  const enc = (s: string) => new TextEncoder().encode(s);
  const a = await ingestFile("user-a", "a.txt", enc("Alpha file about espresso machines."));
  const b = await ingestFile("user-a", "b.txt", enc("Beta file about espresso machines."));
  const c = await ingestFile("user-a", "c.txt", enc("Gamma file about espresso machines."));
  const run = await manager.createRun("user-a", {
    task: "Summarize these files.",
    attachments: [a, b, c].map((f) => ({ id: f.id, kind: "file" as const, label: f.name, fileId: f.id })),
  });
  const done = await manager.waitFor(run.id, 10_000);
  assert.equal(done.status, "completed");
  assert.equal(done.toolCalls.length, 1);
  assert.equal(done.steps.filter((s) => s.type === "tool").length, 1, "steps past the limit are not even started");
});

test("a queued run can be cancelled", async () => {
  const { manager } = fresh({ llm: fakePool(simpleLLM()) });
  const run = await manager.createRun("user-a", { task: "Summarize this.", attachments: [] });
  const cancelled = await manager.cancelRun(run.id, "user-a");
  assert.ok(["queued", "running", "cancelled"].includes(cancelled.status), "cancel is acknowledged immediately");
  const final = await manager.waitFor(run.id, 10_000);
  assert.equal(final.status, "cancelled");
  assert.equal(final.result, undefined);
  assert.ok(final.steps.every((s) => s.status !== "running"));
  await assert.rejects(manager.cancelRun("run_doesnotexist1", "user-a"), /not found/i);
});
