// Where the server is running, and how a run keeps executing after the API
// has answered. On Node the event loop keeps the promise alive. On Cloudflare
// Workers a request may only outlive its response by 30 seconds, so the run is
// handed to the RunExecutor Durable Object (src/cloudflare/executor.ts), whose
// alarm handler may work for up to 15 minutes.

export function isWorkers(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

type ExecutorStub = { start(runId: string): Promise<void>; cancel(): Promise<void> };
type ExecutorNamespace = { idFromName(name: string): unknown; get(id: unknown): ExecutorStub };
type CloudflareContext = {
  env?: { RUN_EXECUTOR?: ExecutorNamespace };
  ctx?: { waitUntil?: (p: Promise<unknown>) => void };
};

async function cloudflareContext(): Promise<CloudflareContext | null> {
  if (!isWorkers()) return null;
  try {
    const mod = (await import("@opennextjs/cloudflare")) as {
      getCloudflareContext?: (opts?: { async?: boolean }) => CloudflareContext | Promise<CloudflareContext>;
    };
    return (await mod.getCloudflareContext?.({ async: true })) ?? null;
  } catch {
    return null;
  }
}

function executor(context: CloudflareContext | null, runId: string): ExecutorStub | null {
  const ns = context?.env?.RUN_EXECUTOR;
  return ns ? ns.get(ns.idFromName(runId)) : null;
}

/**
 * Starts executing a run in the background. `local` performs the work in this
 * process; it is used on Node, and on Workers only when no executor is bound.
 */
export async function dispatchRun(runId: string, local: () => Promise<unknown>): Promise<"local" | "executor"> {
  const context = await cloudflareContext();
  const stub = executor(context, runId);
  if (stub) {
    await stub.start(runId);
    return "executor";
  }
  const work = local();
  context?.ctx?.waitUntil?.(work);
  return "local";
}

/** Asks whichever process is executing the run to stop. No-op outside Workers. */
export async function cancelDispatched(runId: string): Promise<void> {
  const stub = executor(await cloudflareContext(), runId);
  if (stub) await stub.cancel().catch(() => undefined);
}
