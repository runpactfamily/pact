import { handler, json, readJsonBody, toPublicRun } from "@/server/api";
import { getUserId } from "@/server/auth";
import { getRunManager, validateRunInput } from "@/server/runs/manager";

export const dynamic = "force-dynamic";

/** POST /api/runs — create a run and start the agent. */
export const POST = handler(async (request: Request) => {
  const userId = getUserId(request);
  const input = validateRunInput(await readJsonBody(request));
  const run = await getRunManager().createRun(userId, input);
  return json({ run: toPublicRun(run) }, 201);
});

/** GET /api/runs — the caller's runs, newest first. */
export const GET = handler(async (request: Request) => {
  const userId = getUserId(request);
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const surfaceParam = url.searchParams.get("surface");
  const surface = surfaceParam === "onchain" || surfaceParam === "app" ? surfaceParam : undefined;
  const runs = await getRunManager().listRuns(userId, limit, surface);
  return json({ runs: runs.map(toPublicRun) });
});
