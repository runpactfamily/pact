import { DurableObject } from "cloudflare:workers";
import { getConfig, resetConfig } from "@/server/config";
import { log } from "@/server/log";
import { setProviders } from "@/server/providers";
import { getRunManager } from "@/server/runs/manager";
import { setStorage } from "@/server/storage";

// One Durable Object per run. The API hands a queued run to `start`, which
// schedules an alarm; the alarm handler then runs the agent to completion with
// the Durable Object limits (15 minutes wall clock, 30 seconds CPU) instead of
// the 30 seconds a Worker request may outlive its response. Progress is
// written to storage as usual, so the events route follows it from any isolate.
//
// Each invocation also has a budget of outbound requests (50 on the free
// plan). Should a run exhaust it, its failure cannot be stored from the same
// invocation, so a second alarm — with a fresh budget — closes the run out.

type Bindings = Record<string, unknown>;

/**
 * The server code reads its settings from process.env. Inside a Durable
 * Object that is not guaranteed to be filled from the bindings, so copy the
 * string values (vars and secrets) over before any of it runs.
 */
function populateProcessEnv(env: Bindings) {
  const target = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  if (!target) return;
  let added = 0;
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && target[key] === undefined) {
      target[key] = value;
      added++;
    }
  }
  if (added > 0) {
    // Anything configured from the old (empty) environment must be rebuilt.
    resetConfig();
    setStorage(null);
    setProviders(null);
  }
}

export class RunExecutor extends DurableObject<Bindings> {
  constructor(ctx: ConstructorParameters<typeof DurableObject>[0], env: Bindings) {
    super(ctx, env);
    populateProcessEnv(env);
  }

  async start(runId: string): Promise<void> {
    await this.ctx.storage.put("runId", runId);
    await this.ctx.storage.setAlarm(Date.now());
  }

  async cancel(): Promise<void> {
    const runId = await this.ctx.storage.get<string>("runId");
    if (runId) getRunManager().abort(runId);
  }

  async alarm(): Promise<void> {
    const runId = await this.ctx.storage.get<string>("runId");
    if (!runId) return;
    populateProcessEnv(this.env);
    const manager = getRunManager();

    if (await this.ctx.storage.get<boolean>("finalize")) {
      // Second pass: the first one crashed before it could store the outcome.
      try {
        await manager.finalizeInterrupted(runId);
      } catch (error) {
        log.error("executor.finalize_failed", { runId, error });
      } finally {
        await this.ctx.storage.deleteAll();
      }
      return;
    }

    const config = getConfig();
    log.info("executor.alarm", { runId, storage: config.storage, supabaseConfigured: Boolean(config.keys.supabaseUrl && config.keys.supabaseSecret), bindings: Object.keys(this.env).length });
    const outcome = await manager.executeNow(runId);
    if (outcome === "crashed") {
      await this.ctx.storage.put("finalize", true);
      await this.ctx.storage.setAlarm(Date.now() + 500);
      return;
    }
    // Done: never let an alarm retry re-run a finished job.
    await this.ctx.storage.deleteAll();
  }
}
