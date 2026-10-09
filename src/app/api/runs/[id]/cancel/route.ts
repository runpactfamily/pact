import { assertId, handler, json, toPublicRun } from "@/server/api";
import { getUserId } from "@/server/auth";
import { getRunManager } from "@/server/runs/manager";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/runs/:id/cancel */
export const POST = handler(async (request: Request, { params }: Params) => {
  const id = assertId((await params).id, "run");
  const run = await getRunManager().cancelRun(id, getUserId(request));
  return json({ run: toPublicRun(run) });
});
