import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as createRun, GET as listRuns } from "../src/app/api/runs/route";
import { GET as getRun } from "../src/app/api/runs/[id]/route";
import { GET as getSteps } from "../src/app/api/runs/[id]/steps/route";
import { POST as cancelRun } from "../src/app/api/runs/[id]/cancel/route";
import { GET as events } from "../src/app/api/runs/[id]/events/route";
import { POST as uploadFile } from "../src/app/api/files/route";
import { GET as health } from "../src/app/api/health/route";
import { fakePool, fakeReader, fakeSearch, fresh, jsonRequest, simpleLLM } from "./helpers";

const BASE = "http://pact.test";
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const user = { "x-pact-user": "user-e2e" };

test("invalid requests return clean errors", async () => {
  fresh();
  const bad = await createRun(new Request(`${BASE}/api/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" }));
  assert.equal(bad.status, 400);
  assert.deepEqual((await bad.json()).error.code, "INVALID_REQUEST");

  const empty = await createRun(jsonRequest(`${BASE}/api/runs`, { task: "   " }));
  assert.equal(empty.status, 400);
  assert.match((await empty.json()).error.message, /Describe the job/);

  const missing = await getRun(new Request(`${BASE}/api/runs/run_nope123`), params("run_nope123"));
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "NOT_FOUND");

  const weird = await getRun(new Request(`${BASE}/api/runs/../etc`), params("../etc"));
  assert.equal(weird.status, 404);
});

test("file upload rejects unsupported types and accepts text", async () => {
  fresh();
  const form = new FormData();
  form.append("file", new File([new Uint8Array([0, 1, 2])], "tool.exe"));
  const rejected = await uploadFile(new Request(`${BASE}/api/files`, { method: "POST", body: form, headers: user }));
  assert.equal(rejected.status, 415);
  assert.equal((await rejected.json()).error.code, "UNSUPPORTED_FILE");

  const ok = new FormData();
  ok.append("file", new File(["region,units\nNorth,10\n"], "sales.csv"));
  const accepted = await uploadFile(new Request(`${BASE}/api/files`, { method: "POST", body: ok, headers: user }));
  assert.equal(accepted.status, 201);
  const body = await accepted.json();
  assert.match(body.attachment.fileId, /^file_/);
  assert.equal(body.attachment.kind, "file");
});

test("health reports providers and tools without secrets", async () => {
  process.env.GEMINI_API_KEY = "secret-value";
  fresh();
  const response = await health();
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(text, /secret-value/);
  const body = JSON.parse(text);
  assert.equal(body.status, "ok");
  assert.equal(body.providers.gemini, true);
  assert.equal(body.providers.tavily, false);
  assert.equal(body.providers.supabase, false);
  assert.equal(body.storage, "memory");
  assert.ok(Array.isArray(body.details) && body.details.length >= 5);
  assert.ok(body.tools.some((t: { name: string }) => t.name === "web_search"));
  delete process.env.GEMINI_API_KEY;
});

test("end to end: submit a job → run completes → result and steps retrievable", async () => {
  fresh({ search: fakeSearch, reader: fakeReader, llm: fakePool(simpleLLM()) });

  const ok = new FormData();
  ok.append("file", new File(["Supplier A quotes 120 per unit with 6 week lead time. Supplier B quotes 128 with 3 weeks."], "quotes.txt"));
  const upload = await uploadFile(new Request(`${BASE}/api/files`, { method: "POST", body: ok, headers: user }));
  const { attachment } = await upload.json();

  const created = await createRun(jsonRequest(`${BASE}/api/runs`, { task: "Compare these suppliers on price and lead time.", attachments: [attachment] }, user));
  assert.equal(created.status, 201);
  const { run } = await created.json();
  assert.equal(run.status, "queued");
  assert.equal(run.attachments[0].fileId, attachment.fileId);

  // Progress stream delivers a snapshot and a terminal event.
  const stream = await events(new Request(`${BASE}/api/runs/${run.id}/events?user=user-e2e`), params(run.id));
  assert.equal(stream.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const text = await stream.text();
  assert.match(text, /"type":"snapshot"/);
  assert.match(text, /"type":"run.completed"/);

  const fetched = await getRun(new Request(`${BASE}/api/runs/${run.id}`, { headers: user }), params(run.id));
  const { run: final } = await fetched.json();
  assert.equal(final.status, "completed");
  assert.equal(final.routing.mode, "auto");
  assert.ok(final.llm.label, "the public run names the model that did the work");
  assert.ok(final.result.summary.length > 0);
  assert.ok(final.result.sections.length > 0);
  assert.ok(final.result.sources.some((s: { label: string }) => s.label === "quotes.txt"));
  assert.equal(final.userId, undefined, "internal fields are not exposed");

  const steps = await getSteps(new Request(`${BASE}/api/runs/${run.id}/steps`, { headers: user }), params(run.id));
  const body = await steps.json();
  assert.ok(body.steps.length >= 3);
  assert.ok(body.toolCalls.some((c: { tool: string }) => c.tool === "file_read"));
  assert.ok(body.toolCalls.every((c: { output?: Record<string, unknown> }) => !c.output || !("text" in c.output)), "tool outputs store metadata only");

  const list = await listRuns(new Request(`${BASE}/api/runs`, { headers: user }));
  assert.ok((await list.json()).runs.some((r: { id: string }) => r.id === run.id));
  const other = await listRuns(new Request(`${BASE}/api/runs`, { headers: { "x-pact-user": "someone-else" } }));
  assert.equal((await other.json()).runs.length, 0);

  const cancel = await cancelRun(new Request(`${BASE}/api/runs/${run.id}/cancel`, { method: "POST", headers: user }), params(run.id));
  assert.equal((await cancel.json()).run.status, "completed", "cancelling a finished run is a no-op");
});
