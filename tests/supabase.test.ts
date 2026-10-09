import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { BlobStore } from "../src/server/blobs/types";
import type { RunRecord } from "../src/server/runs/types";
import { SupabaseStorage } from "../src/server/storage/supabase";

class MemoryBlobs implements BlobStore {
  readonly kind = "memory";
  store = new Map<string, Uint8Array>();
  async put(key: string, bytes: Uint8Array) {
    this.store.set(key, bytes);
  }
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}

/** A tiny PostgREST stand-in: upserts by id, filters by eq, embeds child tables. */
function fakeRest() {
  const tables: Record<string, Record<string, unknown>[]> = { users: [], runs: [], run_steps: [], tool_calls: [], sources: [], files: [] };
  const calls: { method: string; path: string; headers: Record<string, string> }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url);
    const table = url.pathname.split("/rest/v1/")[1];
    const method = init?.method ?? "GET";
    calls.push({ method, path: table, headers: (init?.headers as Record<string, string>) ?? {} });
    const rows = tables[table];
    if (!rows) return new Response("missing", { status: 404 });
    const eq = [...url.searchParams.entries()].find(([, v]) => v.startsWith("eq."));
    const match = (r: Record<string, unknown>) => !eq || r[eq[0]] === eq[1].slice(3);
    if (method === "GET") {
      let out = rows.filter(match);
      const select = url.searchParams.get("select") ?? "*";
      if (table === "runs" && select.includes("run_steps")) {
        out = out.map((r) => ({ ...r, run_steps: tables.run_steps.filter((s) => s.run_id === r.id), tool_calls: tables.tool_calls.filter((s) => s.run_id === r.id), sources: tables.sources.filter((s) => s.run_id === r.id) }));
      }
      return new Response(JSON.stringify(out), { status: 200 });
    }
    if (method === "DELETE") {
      tables[table] = rows.filter((r) => !match(r));
      return new Response(null, { status: 204 });
    }
    if (method === "POST") {
      const body = JSON.parse(init?.body as string) as Record<string, unknown>[];
      for (const row of body) {
        const i = row.id === undefined ? -1 : rows.findIndex((r) => r.id === row.id);
        if (i >= 0) rows[i] = row;
        else rows.push({ ...row, id: row.id ?? rows.length + 1 });
      }
      return new Response(null, { status: 201 });
    }
    return new Response("nope", { status: 405 });
  };
  return { tables, calls, fetchImpl };
}

test("supabase adapter: runs, steps, tool calls and sources round-trip; files split into rows and blobs", async () => {
  const rest = fakeRest();
  const blobs = new MemoryBlobs();
  const storage = new SupabaseStorage("https://proj.supabase.co", "sb_secret_test", blobs, rest.fetchImpl);
  assert.equal(await storage.ping(), true);

  const run: RunRecord = {
    id: "run_abc",
    userId: "user-a",
    title: "t",
    job: "Compare suppliers",
    attachments: [{ id: "x", kind: "link", label: "example.com" }],
    status: "running",
    stage: "researching",
    createdAt: 1_700_000_000_000,
    startedAt: 1_700_000_000_100,
    steps: [{ id: "step_1", runId: "run_abc", type: "plan", name: "Planning", status: "completed", stage: "understanding", startedAt: 1, completedAt: 2, output: { steps: 1 } }],
    toolCalls: [{ id: "call_1", runId: "run_abc", stepId: "step_1", tool: "web_search", status: "completed", startedAt: 1, completedAt: 3, durationMs: 2, input: { query: "q" }, output: { results: 2 } }],
    activity: [{ t: 1, message: "Reading the job" }],
    sources: [{ title: "A", url: "https://a.example", provider: "tavily", kind: "search", retrievedAt: "2026-01-01T00:00:00.000Z" }],
    llm: { vendor: "openrouter", model: "m" },
    selection: { mode: "auto" },
    routing: { mode: "auto", tier: "heavy", vendor: "openrouter", model: "m", chain: ["openrouter:m"] },
  };
  await storage.saveRun(run);
  run.status = "completed";
  run.completedAt = 1_700_000_005_000;
  run.result = { title: "R", summary: "s", sections: [{ heading: "h", body: ["b"] }], sources: [] };
  await storage.saveRun(run);

  assert.equal(rest.tables.users.length, 1);
  assert.equal(rest.tables.runs.length, 1, "upsert, not duplicate");
  // Workers allow few outbound requests per invocation: a save is one upsert (plus the user once).
  assert.deepEqual(
    rest.calls.filter((c) => c.method !== "GET").map((c) => c.path),
    ["users", "runs", "runs"],
    "two saves cost one user insert and two run upserts",
  );
  assert.equal(rest.tables.sources.length, 0, "children live inside the run row");
  assert.equal((rest.tables.runs[0] as { detail?: { sources: unknown[] } }).detail?.sources.length, 1);
  const back = await storage.getRun("run_abc");
  assert.equal(back?.status, "completed");
  assert.equal(back?.completedAt, 1_700_000_005_000);
  assert.equal(back?.steps[0].name, "Planning");
  assert.equal(back?.toolCalls[0].durationMs, 2);
  assert.equal(back?.sources[0].provider, "tavily");
  assert.deepEqual(back?.llm, { vendor: "openrouter", model: "m" });
  assert.equal(back?.routing?.tier, "heavy");
  assert.deepEqual(back?.selection, { mode: "auto" });
  assert.equal(back?.result?.title, "R");
  assert.equal((await storage.listRuns("user-a")).length, 1);
  assert.equal((await storage.listRuns("someone-else")).length, 0);
  assert.equal(await storage.getRun("run_missing"), null);

  const bytes = new TextEncoder().encode("a,b\n1,2\n");
  await storage.saveFile({ id: "file_1", userId: "user-a", name: "d.csv", kind: "csv", mime: "text/csv", size: bytes.length, createdAt: 5, extracted: true }, bytes, {
    id: "file_1", name: "d.csv", kind: "csv", mime: "text/csv", size: bytes.length, createdAt: 5, text: "a,b", meta: { chars: 3 },
  });
  assert.ok(blobs.store.has("user-a/file_1"), "bytes go to the blob store, not the database");
  assert.equal(rest.tables.files[0].storage_path, "memory:user-a/file_1");
  assert.equal((await storage.getFile("file_1"))?.name, "d.csv");
  assert.equal((await storage.getDocument("file_1"))?.text, "a,b");
  assert.ok(rest.calls.every((c) => c.headers.apikey === "sb_secret_test"), "the secret is sent only as the server-side api key");
});

test("supabase adapter: schema missing → ping false, writes fail cleanly", async () => {
  const storage = new SupabaseStorage("https://proj.supabase.co", "k", new MemoryBlobs(), async () => new Response('{"message":"relation does not exist"}', { status: 404 }));
  assert.equal(await storage.ping(), false);
  await assert.rejects(storage.getRun("run_x"), (e: Error & { code?: string }) => e.code === "STORAGE_FAILURE" && !/relation/.test(e.message));
});

test("supabase adapter: runs written before migration 0003 are read from the child tables", async () => {
  const rest = fakeRest();
  const storage = new SupabaseStorage("https://proj.supabase.co", "sb_secret_test", new MemoryBlobs(), rest.fetchImpl);
  rest.tables.runs.push({ id: "run_old", user_id: "user-a", title: "t", job: "j", attachments: [], status: "completed", stage: "done", created_at: "2026-01-01T00:00:00.000Z", started_at: null, completed_at: null, result: null, error: null, activity: [], llm: null, selection: null, routing: null, detail: null });
  rest.tables.run_steps.push({ id: "step_old", run_id: "run_old", type: "plan", name: "Planning", status: "completed", stage: "understanding", started_at: null, completed_at: null, input: null, output: null, error: null, position: 0 });
  rest.tables.tool_calls.push({ id: "call_old", run_id: "run_old", step_id: "step_old", tool: "calculator", status: "completed", started_at: "2026-01-01T00:00:01.000Z", completed_at: null, duration_ms: 4, input: {}, output: null, error: null });
  rest.tables.sources.push({ id: 1, run_id: "run_old", title: "A", url: null, provider: "tavily", kind: "search", retrieved_at: "2026-01-01T00:00:00.000Z", published_at: null });
  const back = await storage.getRun("run_old");
  assert.equal(back?.steps[0].name, "Planning");
  assert.equal(back?.toolCalls[0].durationMs, 4);
  assert.equal(back?.sources[0].provider, "tavily");
});
