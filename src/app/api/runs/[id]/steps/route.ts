import { assertId, handler, json, toPublicStep } from "@/server/api";
import { getUserId } from "@/server/auth";
import { PactError } from "@/server/errors";
import { getRunManager } from "@/server/runs/manager";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/runs/:id/steps — steps and tool calls, metadata only. */
export const GET = handler(async (request: Request, { params }: Params) => {
  const id = assertId((await params).id, "run");
  const run = await getRunManager().getRun(id, getUserId(request));
  if (!run) throw new PactError("NOT_FOUND", "Run not found.");
  return json({
    steps: run.steps.map(toPublicStep),
    toolCalls: run.toolCalls.map((c) => ({
      id: c.id,
      stepId: c.stepId,
      tool: c.tool,
      status: c.status,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
      durationMs: c.durationMs,
      input: c.input,
      output: c.output,
      error: c.error,
    })),
  });
});
