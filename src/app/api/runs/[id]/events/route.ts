import { assertId, errorResponse, toPublicRun } from "@/server/api";
import { getUserId } from "@/server/auth";
import { PactError } from "@/server/errors";
import { getRunManager } from "@/server/runs/manager";
import { TERMINAL, type RunEvent, type RunRecord, type StepRecord } from "@/server/runs/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const KEEPALIVE_MS = 15_000;
const POLL_MS = 1_200;
const MAX_STREAM_MS = 10 * 60_000;

/** Named events the UI maps to status lines. Each one reflects something that actually happened. */
function stepEventName(step: StepRecord): string {
  const phase = step.status === "running" ? "started" : step.status === "completed" ? "completed" : step.status === "failed" ? "failed" : "skipped";
  const kind = step.type === "plan" ? "planning" : step.type === "tool" ? "tool" : step.type === "evaluate" ? "analysis" : "result";
  return `${kind}.${phase}`;
}

function stepPayload(step: StepRecord) {
  return {
    id: step.id,
    name: step.name,
    kind: step.type,
    tool: typeof step.input?.tool === "string" ? step.input.tool : undefined,
    status: step.status,
    stage: step.stage,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    error: step.error,
  };
}

function toClientEvent(event: RunEvent): unknown {
  switch (event.type) {
    case "stage":
      return { type: "stage", stage: event.stage };
    case "activity":
      return { type: "activity", message: event.message, t: event.t };
    case "step":
      return { type: stepEventName(event.step), step: stepPayload(event.step) };
    case "completed":
      return { type: "run.completed", run: toPublicRun(event.run) };
    case "failed":
      return { type: "run.failed", run: toPublicRun(event.run) };
    case "cancelled":
      return { type: "run.cancelled", run: toPublicRun(event.run) };
  }
}

/** Events implied by the difference between two snapshots of a run (for processes that are not executing it). */
function diffEvents(prev: RunRecord, next: RunRecord): unknown[] {
  const out: unknown[] = [];
  if (next.stage !== prev.stage) out.push({ type: "stage", stage: next.stage });
  for (const line of next.activity.slice(prev.activity.length)) out.push({ type: "activity", message: line.message, t: line.t });
  const before = new Map(prev.steps.map((s) => [s.id, s]));
  for (const step of next.steps) {
    const old = before.get(step.id);
    if (!old || old.status !== step.status) out.push({ type: stepEventName(step), step: stepPayload(step) });
  }
  if (next.status !== prev.status && TERMINAL.has(next.status)) {
    out.push({ type: `run.${next.status}`, run: toPublicRun(next) });
  }
  return out;
}

/** GET /api/runs/:id/events — Server-Sent Events until the run ends. */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  try {
    const id = assertId((await params).id, "run");
    const userId = getUserId(request);
    const manager = getRunManager();
    const run = await manager.getRun(id, userId);
    if (!run) throw new PactError("NOT_FOUND", "Run not found.");

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let open = true;
        const send = (payload: unknown) => {
          if (!open) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        const timers: ReturnType<typeof setTimeout>[] = [];
        const close = () => {
          if (!open) return;
          open = false;
          clearInterval(keepalive);
          for (const t of timers) clearTimeout(t);
          off();
          try {
            controller.close();
          } catch {
            // Already closed by the client.
          }
        };
        const keepalive = setInterval(() => {
          if (open) controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, KEEPALIVE_MS);
        const off = manager.subscribe(id, (event) => {
          send(toClientEvent(event));
          if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") close();
        });

        send({ type: "snapshot", run: toPublicRun(run), steps: run.steps.map(stepPayload) });
        if (TERMINAL.has(run.status)) {
          close();
          return;
        }

        // Another process may be executing this run (Workers isolates, several Node servers):
        // then progress only shows up in storage, so follow it from there.
        if (!manager.isActive(id)) {
          let last = run;
          const started = Date.now();
          const poll = async () => {
            if (!open) return;
            try {
              const next = await manager.getRun(id, userId);
              if (next) {
                for (const event of diffEvents(last, next)) send(event);
                last = next;
                if (TERMINAL.has(next.status)) {
                  close();
                  return;
                }
              }
            } catch {
              // Transient read failure: try again on the next tick.
            }
            if (Date.now() - started > MAX_STREAM_MS) {
              close();
              return;
            }
            timers.push(setTimeout(poll, POLL_MS));
          };
          timers.push(setTimeout(poll, POLL_MS));
        }
        request.signal.addEventListener("abort", close, { once: true });
      },
    });

    return new Response(stream, {
      headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
