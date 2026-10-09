import type { BlobStore } from "../blobs/types";
import { PactError } from "../errors";
import { log } from "../log";
import type { DocumentRepresentation, FileRecord } from "../files/types";
import type { RunRecord, SourceRecord, StepRecord, ToolCallRecord } from "../runs/types";
import type { StorageAdapter } from "./types";

// Supabase/Postgres through PostgREST, using the server-side secret key.
// Records go to the tables in supabase/migrations; raw file bytes go to a
// BlobStore (local disk for now). The secret never leaves this process.

interface RunRow {
  id: string;
  user_id: string;
  title: string;
  job: string;
  attachments: RunRecord["attachments"];
  status: RunRecord["status"];
  stage: RunRecord["stage"];
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result: RunRecord["result"] | null;
  error: RunRecord["error"] | null;
  activity: RunRecord["activity"];
  llm: RunRecord["llm"] | null;
  selection: RunRecord["selection"] | null;
  routing: RunRecord["routing"] | null;
  /** Steps, tool calls and sources as one document (migration 0003). Null on runs written before it. */
  detail?: RunDetail | null;
  run_steps?: StepRow[];
  tool_calls?: ToolCallRow[];
  sources?: SourceRow[];
}

interface RunDetail {
  steps: StepRecord[];
  toolCalls: ToolCallRecord[];
  sources: SourceRecord[];
  surface?: "app" | "onchain";
  chain?: string;
}

interface StepRow {
  id: string;
  run_id: string;
  type: StepRecord["type"];
  name: string;
  status: StepRecord["status"];
  stage: StepRecord["stage"];
  started_at: string | null;
  completed_at: string | null;
  input: StepRecord["input"] | null;
  output: StepRecord["output"] | null;
  error: StepRecord["error"] | null;
  position: number;
}

interface ToolCallRow {
  id: string;
  run_id: string;
  step_id: string;
  tool: string;
  status: ToolCallRecord["status"];
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  input: ToolCallRecord["input"];
  output: ToolCallRecord["output"] | null;
  error: ToolCallRecord["error"] | null;
}

interface SourceRow {
  id?: number;
  run_id: string;
  title: string;
  url: string | null;
  provider: string;
  kind: SourceRecord["kind"];
  retrieved_at: string;
  published_at: string | null;
}

interface FileRow {
  id: string;
  user_id: string;
  name: string;
  kind: FileRecord["kind"];
  mime: string;
  size: number;
  created_at: string;
  extracted: boolean;
  extraction_error: string | null;
  storage_path: string | null;
  document: DocumentRepresentation | null;
}

const iso = (ms: number | undefined): string | null => (ms === undefined ? null : new Date(ms).toISOString());
const ms = (value: string | null | undefined): number | undefined => (value ? new Date(value).getTime() : undefined);

export class SupabaseStorage implements StorageAdapter {
  readonly kind = "supabase";
  private readonly rest: string;
  private readonly knownUsers = new Set<string>();

  constructor(
    url: string,
    private readonly secret: string,
    private readonly blobs: BlobStore,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.rest = `${url.replace(/\/+$/, "")}/rest/v1`;
  }

  private async request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", pathAndQuery: string, body?: unknown, prefer?: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.rest}/${pathAndQuery}`, {
        method,
        headers: {
          apikey: this.secret,
          authorization: `Bearer ${this.secret}`,
          "content-type": "application/json",
          accept: "application/json",
          ...(prefer ? { prefer } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new PactError("STORAGE_FAILURE", "The database could not be reached.", error);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      log.error("supabase.request_failed", { status: String(response.status), path: pathAndQuery.split("?")[0], detail: detail.slice(0, 300) });
      if (/does not exist|schema cache/i.test(detail)) {
        throw new PactError("STORAGE_FAILURE", "The database schema is out of date. Apply the latest file in supabase/migrations and try again.", { status: response.status });
      }
      throw new PactError("STORAGE_FAILURE", "The database rejected the request.", { status: response.status });
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** True when the schema has been applied. Used to decide whether to use this adapter. */
  async ping(): Promise<boolean> {
    try {
      await this.request<unknown[]>("GET", "runs?select=id&limit=1");
      return true;
    } catch {
      return false;
    }
  }

  private async ensureUser(userId: string) {
    if (this.knownUsers.has(userId)) return;
    await this.request("POST", "users?on_conflict=id", [{ id: userId }], "resolution=ignore-duplicates,return=minimal");
    this.knownUsers.add(userId);
  }

  // ---- runs ----

  private toRun(row: RunRow): RunRecord {
    const base = this.toRunBase(row);
    if (row.detail) {
      return { ...base, steps: row.detail.steps ?? [], toolCalls: row.detail.toolCalls ?? [], sources: row.detail.sources ?? [], surface: row.detail.surface ?? "app", chain: row.detail.chain };
    }
    return { ...base, ...this.legacyChildren(row) };
  }

  private toRunBase(row: RunRow): Omit<RunRecord, "steps" | "toolCalls" | "sources"> {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      job: row.job,
      attachments: row.attachments ?? [],
      status: row.status,
      stage: row.stage,
      createdAt: ms(row.created_at)!,
      startedAt: ms(row.started_at),
      completedAt: ms(row.completed_at),
      result: row.result ?? undefined,
      error: row.error ?? undefined,
      activity: row.activity ?? [],
      llm: row.llm ?? undefined,
      selection: row.selection ?? { mode: "auto" },
      routing: row.routing ?? undefined,
    };
  }

  /** Runs saved before migration 0003 keep their steps, tool calls and sources in the child tables. */
  private legacyChildren(row: RunRow): Pick<RunRecord, "steps" | "toolCalls" | "sources"> {
    const steps = [...(row.run_steps ?? [])].sort((a, b) => a.position - b.position);
    return {
      steps: steps.map((s) => ({
        id: s.id,
        runId: s.run_id,
        type: s.type,
        name: s.name,
        status: s.status,
        stage: s.stage,
        startedAt: ms(s.started_at),
        completedAt: ms(s.completed_at),
        input: s.input ?? undefined,
        output: s.output ?? undefined,
        error: s.error ?? undefined,
      })),
      toolCalls: [...(row.tool_calls ?? [])]
        .sort((a, b) => a.started_at.localeCompare(b.started_at))
        .map((c) => ({
          id: c.id,
          runId: c.run_id,
          stepId: c.step_id,
          tool: c.tool,
          status: c.status,
          startedAt: ms(c.started_at)!,
          completedAt: ms(c.completed_at),
          durationMs: c.duration_ms ?? undefined,
          input: c.input ?? {},
          output: c.output ?? undefined,
          error: c.error ?? undefined,
        })),
      sources: (row.sources ?? []).map((s) => ({ title: s.title, url: s.url ?? undefined, provider: s.provider, kind: s.kind, retrievedAt: s.retrieved_at, publishedAt: s.published_at ?? undefined })),
    };
  }

  async getRun(id: string) {
    const rows = await this.request<RunRow[]>("GET", `runs?id=eq.${encodeURIComponent(id)}&select=*,run_steps(*),tool_calls(*),sources(*)`);
    return rows[0] ? this.toRun(rows[0]) : null;
  }

  async saveRun(run: RunRecord) {
    await this.ensureUser(run.userId);
    // One request per save: steps, tool calls and sources travel inside the row.
    const row: Omit<RunRow, "run_steps" | "tool_calls" | "sources"> = {
      id: run.id,
      user_id: run.userId,
      title: run.title,
      job: run.job,
      attachments: run.attachments,
      status: run.status,
      stage: run.stage,
      created_at: iso(run.createdAt)!,
      started_at: iso(run.startedAt),
      completed_at: iso(run.completedAt),
      result: run.result ?? null,
      error: run.error ?? null,
      activity: run.activity,
      llm: run.llm ?? null,
      selection: run.selection ?? { mode: "auto" },
      routing: run.routing ?? null,
      detail: { steps: run.steps, toolCalls: run.toolCalls, sources: run.sources ?? [], surface: run.surface ?? "app", chain: run.chain },
    };
    await this.request("POST", "runs?on_conflict=id", [row], "resolution=merge-duplicates,return=minimal");
  }

  async listRuns(userId: string, limit = 50, surface?: "app" | "onchain") {
    // Runs written before the surface existed are app runs.
    const filter = surface === "onchain" ? "&detail->>surface=eq.onchain" : surface === "app" ? "&or=(detail->>surface.is.null,detail->>surface.eq.app)" : "";
    const rows = await this.request<RunRow[]>("GET", `runs?user_id=eq.${encodeURIComponent(userId)}${filter}&select=*,run_steps(*),tool_calls(*),sources(*)&order=created_at.desc&limit=${limit}`);
    return rows.map((r) => this.toRun(r));
  }

  // ---- files ----

  private toFile(row: FileRow): FileRecord {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      kind: row.kind,
      mime: row.mime,
      size: row.size,
      createdAt: ms(row.created_at)!,
      extracted: row.extracted,
      extractionError: row.extraction_error ?? undefined,
    };
  }

  async getFile(id: string) {
    const rows = await this.request<FileRow[]>("GET", `files?id=eq.${encodeURIComponent(id)}&select=id,user_id,name,kind,mime,size,created_at,extracted,extraction_error,storage_path`);
    return rows[0] ? this.toFile(rows[0]) : null;
  }

  async saveFile(record: FileRecord, bytes: Uint8Array, document: DocumentRepresentation | null) {
    await this.ensureUser(record.userId);
    const key = `${record.userId}/${record.id}`;
    await this.blobs.put(key, bytes, record.mime);
    const row: FileRow = {
      id: record.id,
      user_id: record.userId,
      name: record.name,
      kind: record.kind,
      mime: record.mime,
      size: record.size,
      created_at: iso(record.createdAt)!,
      extracted: record.extracted,
      extraction_error: record.extractionError ?? null,
      storage_path: `${this.blobs.kind}:${key}`,
      document,
    };
    await this.request("POST", "files?on_conflict=id", [row], "resolution=merge-duplicates,return=minimal");
  }

  async getDocument(id: string) {
    const rows = await this.request<Pick<FileRow, "document">[]>("GET", `files?id=eq.${encodeURIComponent(id)}&select=document`);
    return rows[0]?.document ?? null;
  }

  async listFiles(userId: string, limit = 100) {
    const rows = await this.request<FileRow[]>("GET", `files?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,name,kind,mime,size,created_at,extracted,extraction_error,storage_path&order=created_at.desc&limit=${limit}`);
    return rows.map((r) => this.toFile(r));
  }
}
