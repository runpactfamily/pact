import { runAgent } from "../agent/engine";
import { getConfig } from "../config";
import { PactError, toClientError } from "../errors";
import { log } from "../log";
import { isChainId } from "../onchain/chains";
import { cancelDispatched, dispatchRun } from "../runtime";
import type { RunSurface } from "../tools/registry";
import { WriteCoalescer } from "./coalesce";
import { getProviders } from "../providers";
import type { Providers } from "../providers/types";
import { getStorage } from "../storage";
import { getRegistry, type ToolRegistry } from "../tools/registry";
import { newId } from "../utils/ids";
import { sanitizeText, truncate } from "../utils/text";
import type { ModelSelection } from "../providers/types";
import type { Attachment, RunInput, RunStage } from "@/lib/pact/types";
import { canTransition, TERMINAL, type RunEvent, type RunRecord, type SourceRecord, type StepRecord, type StepStatus, type StepType, type ToolCallRecord } from "./types";

// Owns the lifecycle of every run: creation, execution in the background,
// state transitions, persistence, and progress events for subscribers.

export interface RunDeps {
  providers: Providers;
  registry: ToolRegistry;
}

/** What the engine is handed: a narrow API on one run, with no access to storage or other runs. */
export interface RunHandle {
  readonly run: RunRecord;
  readonly signal: AbortSignal;
  setStage(stage: RunStage): Promise<void>;
  activity(message: string): Promise<void>;
  beginStep(type: StepType, name: string, stage: RunStage, input?: Record<string, unknown>): Promise<StepRecord>;
  endStep(step: StepRecord, status: StepStatus, output?: Record<string, unknown>, error?: unknown): Promise<void>;
  beginToolCall(stepId: string, tool: string, input: Record<string, unknown>): ToolCallRecord;
  addSources(sources: SourceRecord[]): void;
  setLlm(llm: { vendor: string; model: string }): void;
  setRouting(routing: NonNullable<RunRecord["routing"]>): void;
  endToolCall(call: ToolCallRecord, output?: Record<string, unknown>, error?: unknown): Promise<void>;
  throwIfCancelled(): void;
}

type Listener = (event: RunEvent) => void;

const MAX_TITLE = 64;
const MAX_JOB = 4000;
const MAX_ATTACHMENTS = 20;

function titleFrom(task: string): string {
  const clean = task.replace(/\s+/g, " ").trim();
  return clean.length <= MAX_TITLE ? clean : truncate(clean, MAX_TITLE);
}

function cleanAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  const out: Attachment[] = [];
  for (const item of raw.slice(0, MAX_ATTACHMENTS)) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    const kind = a.kind;
    if (kind !== "file" && kind !== "link" && kind !== "github") continue;
    if (typeof a.label !== "string" || !a.label.trim()) continue;
    out.push({
      id: typeof a.id === "string" ? a.id.slice(0, 40) : newId("att"),
      kind,
      label: sanitizeText(a.label, 200),
      detail: typeof a.detail === "string" ? sanitizeText(a.detail, 500) : undefined,
      fileId: typeof a.fileId === "string" && /^file_[a-z0-9]+$/.test(a.fileId) ? a.fileId : undefined,
    });
  }
  return out;
}

const VENDORS = new Set(["openrouter", "gemini", "groq"]);
const MODEL_ID = /^[\w.:/-]{2,120}$/;

export function cleanSelection(raw: unknown): ModelSelection {
  if (!raw || typeof raw !== "object") return { mode: "auto" };
  const m = raw as Record<string, unknown>;
  if (m.mode !== "manual") return { mode: "auto" };
  if (typeof m.provider !== "string" || !VENDORS.has(m.provider)) throw new PactError("INVALID_REQUEST", "Unknown model provider.");
  if (typeof m.model !== "string" || !MODEL_ID.test(m.model)) throw new PactError("INVALID_REQUEST", "Invalid model id.");
  return { mode: "manual", provider: m.provider as ModelSelection extends { provider: infer P } ? P : never, model: m.model };
}

export function validateRunInput(raw: unknown): RunInput {
  if (!raw || typeof raw !== "object") throw new PactError("INVALID_REQUEST", "Request body must be an object.");
  const body = raw as Record<string, unknown>;
  const task = typeof body.task === "string" ? sanitizeText(body.task, MAX_JOB) : "";
  if (!task) throw new PactError("INVALID_REQUEST", "Describe the job before running it.");
  const surface = body.surface === "onchain" ? "onchain" : "app";
  const chain = surface === "onchain" && isChainId(body.chain) ? body.chain : undefined;
  return { task, attachments: cleanAttachments(body.attachments), model: cleanSelection(body.model), surface, chain };
}

const STALE_GRACE_MS = 60_000;
/** Progress writes closer together than this are merged into one. */
const SAVE_GAP_MS = 2_500;
const INTERRUPTED_MESSAGE = "The run stopped before it could finish. Give Pact the job again.";

/** The newest timestamp a run's own records carry. */
function lastProgress(run: RunRecord): number {
  let t = Math.max(run.createdAt, run.startedAt ?? 0);
  for (const step of run.steps) t = Math.max(t, step.startedAt ?? 0, step.completedAt ?? 0);
  for (const call of run.toolCalls) t = Math.max(t, call.startedAt ?? 0, call.completedAt ?? 0);
  const activity = run.activity.at(-1);
  if (activity) t = Math.max(t, (run.startedAt ?? run.createdAt) + activity.t);
  return t;
}

export class RunManager {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly active = new Map<string, AbortController>();

  constructor(private readonly deps: (run?: RunRecord) => RunDeps = (run) => ({ providers: getProviders(), registry: getRegistry(run?.surface ?? "app") })) {}

  async createRun(userId: string, input: RunInput): Promise<RunRecord> {
    const run: RunRecord = {
      id: newId("run"),
      userId,
      title: titleFrom(input.task),
      job: input.task,
      attachments: input.attachments,
      status: "queued",
      stage: "understanding",
      createdAt: Date.now(),
      steps: [],
      toolCalls: [],
      activity: [],
      sources: [],
      selection: input.model ?? { mode: "auto" },
      surface: input.surface ?? "app",
      chain: input.chain,
    };
    await getStorage().saveRun(run);
    log.info("run.created", { runId: run.id, attachments: run.attachments.length });
    // The API returns the queued run immediately; the work continues in this
    // process or, on Workers, in the run's Durable Object.
    const where = await dispatchRun(run.id, () => this.executeNow(run.id));
    log.info("run.dispatched", { runId: run.id, where });
    return run;
  }

  async getRun(id: string, userId: string): Promise<RunRecord | null> {
    const run = await getStorage().getRun(id);
    return run && run.userId === userId ? this.reconcile(run) : null;
  }

  async listRuns(userId: string, limit = 50, surface?: RunSurface): Promise<RunRecord[]> {
    const runs = await getStorage().listRuns(userId, limit, surface);
    return Promise.all(runs.map((run) => this.reconcile(run)));
  }

  /**
   * A run that is still marked queued/running long after its last progress was
   * lost with the process executing it (a restart, an evicted isolate). Close it
   * out as failed so the UI never shows it as working forever.
   */
  private async reconcile(run: RunRecord): Promise<RunRecord> {
    if (TERMINAL.has(run.status) || this.active.has(run.id)) return run;
    const stale = Date.now() - lastProgress(run) > getConfig().runTimeoutMs + STALE_GRACE_MS;
    if (!stale) return run;
    await this.markInterrupted(run);
    return run;
  }

  /** Closes out a run whose execution was lost, so it never shows as working forever. */
  async markInterrupted(run: RunRecord): Promise<void> {
    if (TERMINAL.has(run.status)) return;
    for (const step of run.steps) if (step.status === "running") step.status = "failed";
    run.error = { code: "RUN_INTERRUPTED", message: INTERRUPTED_MESSAGE };
    if (run.status === "queued") run.startedAt ??= run.createdAt;
    run.status = "failed";
    run.completedAt = Date.now();
    await getStorage().saveRun(run);
    log.warn("run.interrupted", { runId: run.id });
    this.emit({ type: "failed", runId: run.id, run });
  }

  /** Loads a run and, if it is still queued or running, marks it interrupted. */
  async finalizeInterrupted(runId: string): Promise<void> {
    const run = await getStorage().getRun(runId);
    if (run) await this.markInterrupted(run);
  }

  /** Aborts a run executing in this process. */
  abort(runId: string): boolean {
    const controller = this.active.get(runId);
    controller?.abort();
    return Boolean(controller);
  }

  /** Executes a queued run to completion in this process. "crashed" means its final state may not have been stored. */
  async executeNow(runId: string): Promise<"finished" | "crashed"> {
    try {
      await this.execute(runId);
      return "finished";
    } catch (error) {
      log.error("run.execute_crashed", { runId, error });
      return "crashed";
    }
  }

  async cancelRun(id: string, userId: string): Promise<RunRecord> {
    const run = await this.getRun(id, userId);
    if (!run) throw new PactError("NOT_FOUND", "Run not found.");
    if (TERMINAL.has(run.status)) return run;
    if (!this.abort(id) && run.status === "running") await cancelDispatched(id);
    if (run.status === "queued") {
      // Not started yet (or the process that would run it is gone): close it out here.
      await this.transition(run, "cancelled");
      this.emit({ type: "cancelled", runId: run.id, run });
    }
    return run;
  }

  /** True when this process is the one executing the run (events are delivered in memory). */
  isActive(runId: string): boolean {
    return this.active.has(runId);
  }

  subscribe(runId: string, listener: Listener): () => void {
    let set = this.listeners.get(runId);
    if (!set) {
      set = new Set();
      this.listeners.set(runId, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) this.listeners.delete(runId);
    };
  }

  /** Resolves when the run reaches a terminal state. For tests and tooling. */
  waitFor(runId: string, timeoutMs = 30_000): Promise<RunRecord> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Run ${runId} did not finish within ${timeoutMs}ms`));
      }, timeoutMs);
      const settle = (run: RunRecord) => {
        clearTimeout(timer);
        off();
        resolve(run);
      };
      const off = this.subscribe(runId, (event) => {
        if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") settle(event.run);
      });
      // The run may have finished before the subscription existed.
      void getStorage()
        .getRun(runId)
        .then((run) => {
          if (run && TERMINAL.has(run.status)) settle(run);
        });
    });
  }

  private emit(event: RunEvent) {
    for (const listener of this.listeners.get(event.runId) ?? []) {
      try {
        listener(event);
      } catch (error) {
        log.warn("run.listener_failed", { runId: event.runId, detail: String(error) });
      }
    }
  }

  private async transition(run: RunRecord, to: RunRecord["status"]) {
    if (!canTransition(run.status, to)) throw new PactError("INTERNAL_ERROR", `Cannot move run from ${run.status} to ${to}.`);
    run.status = to;
    if (to === "running") run.startedAt = Date.now();
    if (TERMINAL.has(to)) run.completedAt = Date.now();
    await getStorage().saveRun(run);
  }

  private async execute(runId: string) {
    const storage = getStorage();
    const run = await storage.getRun(runId);
    if (!run || run.status !== "queued") return;
    run.sources ??= [];
    run.selection ??= { mode: "auto" };

    const config = getConfig();
    const controller = new AbortController();
    this.active.set(runId, controller);
    const timeout = setTimeout(() => controller.abort(new PactError("PROVIDER_TIMEOUT", "The run took too long and was stopped.")), config.runTimeoutMs);

    await this.transition(run, "running");
    log.info("run.started", { runId });
    const manager = this;
    const saver = new WriteCoalescer<RunRecord>((r) => storage.saveRun(r), SAVE_GAP_MS);

    const handle: RunHandle = {
      run,
      signal: controller.signal,
      async setStage(stage) {
        if (run.stage === stage) return;
        run.stage = stage;
        await saver.save(run);
        manager.emit({ type: "stage", runId, stage });
      },
      async activity(message) {
        const entry = { t: Date.now() - (run.startedAt ?? run.createdAt), message };
        run.activity.push(entry);
        if (run.activity.length > 60) run.activity.shift();
        await saver.save(run);
        manager.emit({ type: "activity", runId, message, t: entry.t });
      },
      async beginStep(type, name, stage, input) {
        const step: StepRecord = { id: newId("step"), runId, type, name, status: "running", stage, startedAt: Date.now(), input };
        run.steps.push(step);
        await handle.setStage(stage);
        await saver.save(run);
        manager.emit({ type: "step", runId, step });
        return step;
      },
      async endStep(step, status, output, error) {
        step.status = status;
        step.completedAt = Date.now();
        if (output) step.output = output;
        if (error) step.error = toClientError(error);
        await saver.save(run);
        manager.emit({ type: "step", runId, step });
      },
      beginToolCall(stepId, tool, input) {
        const call: ToolCallRecord = { id: newId("call"), runId, stepId, tool, status: "running", startedAt: Date.now(), input };
        run.toolCalls.push(call);
        log.info("tool.called", { runId, tool, stepId });
        return call;
      },
      async endToolCall(call, output, error) {
        call.completedAt = Date.now();
        call.durationMs = call.completedAt - call.startedAt;
        if (error) {
          call.status = "failed";
          call.error = toClientError(error);
          log.warn("tool.failed", { runId, tool: call.tool, durationMs: call.durationMs, code: call.error.code });
        } else {
          call.status = "completed";
          call.output = output;
          log.info("tool.completed", { runId, tool: call.tool, durationMs: call.durationMs, status: "completed" });
        }
        await saver.save(run);
      },
      addSources(sources) {
        const seen = new Set(run.sources.map((s) => s.url ?? s.title));
        for (const s of sources) {
          const key = s.url ?? s.title;
          if (seen.has(key)) continue;
          seen.add(key);
          run.sources.push(s);
        }
        if (run.sources.length > 60) run.sources.length = 60;
      },
      setLlm(llm) {
        run.llm = llm;
      },
      setRouting(routing) {
        run.routing = routing;
        run.llm = { vendor: routing.vendor, model: routing.model };
      },
      throwIfCancelled() {
        if (controller.signal.aborted) {
          const reason = controller.signal.reason;
          throw reason instanceof PactError ? reason : new PactError("RUN_CANCELLED", "The run was cancelled.");
        }
      },
    };

    try {
      const result = await runAgent(handle, this.deps(run));
      handle.throwIfCancelled();
      run.result = result;
      run.stage = "done";
      saver.cancel();
      await saver.settle();
      await this.transition(run, "completed");
      log.info("run.completed", { runId, durationMs: run.completedAt! - run.startedAt!, steps: run.steps.length, toolCalls: run.toolCalls.length });
      this.emit({ type: "stage", runId, stage: "done" });
      this.emit({ type: "completed", runId, run });
    } catch (error) {
      const cancelled = (error instanceof PactError && error.code === "RUN_CANCELLED") || (controller.signal.aborted && !(controller.signal.reason instanceof PactError));
      for (const step of run.steps) if (step.status === "running") step.status = cancelled ? "skipped" : "failed";
      saver.cancel();
      await saver.settle().catch(() => undefined);
      if (cancelled) {
        await this.transition(run, "cancelled");
        log.info("run.cancelled", { runId });
        this.emit({ type: "cancelled", runId, run });
      } else {
        run.error = toClientError(error);
        await this.transition(run, "failed");
        log.error("run.failed", { runId, code: run.error.code, error });
        this.emit({ type: "failed", runId, run });
      }
    } finally {
      clearTimeout(timeout);
      this.active.delete(runId);
    }
  }
}

const g = globalThis as unknown as { __pactRunManager?: RunManager };

export function getRunManager(): RunManager {
  if (!g.__pactRunManager) g.__pactRunManager = new RunManager();
  return g.__pactRunManager;
}

/** Test hook. */
export function setRunManager(manager: RunManager | null) {
  g.__pactRunManager = manager ?? undefined;
}
