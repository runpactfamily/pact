import { isPactError, PactError, toClientError } from "./errors";
import { log } from "./log";
import type { RunRecord, StepRecord } from "./runs/types";
import { modelDisplay } from "@/lib/pact/models";
import type { Run } from "@/lib/pact/types";

// Shared pieces for the route handlers: JSON responses, error mapping, and
// the public shape of a run (no user id, no tool call internals).

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}

export function errorResponse(error: unknown): Response {
  const client = toClientError(error);
  const status = isPactError(error) ? error.status : 500;
  if (!isPactError(error)) log.error("api.unhandled", { error });
  else if (error.status >= 500) log.error("api.error", { code: error.code, error: error.detail ?? error });
  return json({ error: client }, status);
}

/** Wraps a handler so every thrown error becomes a clean JSON error. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new PactError("INVALID_REQUEST", "Send JSON with content-type: application/json.");
  try {
    return await request.json();
  } catch {
    throw new PactError("INVALID_REQUEST", "The request body is not valid JSON.");
  }
}

export function toPublicRun(run: RunRecord): Run {
  return {
    id: run.id,
    title: run.title,
    task: run.job,
    attachments: run.attachments,
    status: run.status,
    stage: run.stage,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: run.startedAt && run.completedAt ? run.completedAt - run.startedAt : undefined,
    result: run.result,
    error: run.error,
    activity: run.activity,
    sources: run.sources ?? [],
    selection: run.selection ?? { mode: "auto" },
    routing: run.routing,
    llm: run.llm ? { ...run.llm, label: modelDisplay(run.llm) ?? run.llm.model } : undefined,
    surface: run.surface ?? "app",
    chain: run.chain as Run["chain"],
  };
}

export function toPublicStep(step: StepRecord) {
  return {
    id: step.id,
    type: step.type,
    name: step.name,
    status: step.status,
    stage: step.stage,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    durationMs: step.startedAt && step.completedAt ? step.completedAt - step.startedAt : undefined,
    input: step.input,
    output: step.output,
    error: step.error,
  };
}

export function assertId(id: string | undefined, prefix: string): string {
  if (!id || !new RegExp(`^${prefix}_[a-z0-9]{6,40}$`).test(id)) throw new PactError("NOT_FOUND", "Not found.");
  return id;
}
