import { assertId, handler, json, toPublicRun } from "@/server/api";
import { getUserId } from "@/server/auth";
import { PactError } from "@/server/errors";
import { getRunManager } from "@/server/runs/manager";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/runs/:id */
export const GET = handler(async (request: Request, { params }: Params) => {
  const id = assertId((await params).id, "run");
  const run = await getRunManager().getRun(id, getUserId(request));
  if (!run) throw new PactError("NOT_FOUND", "Run not found.");
  return json({ run: toPublicRun(run) });
});
