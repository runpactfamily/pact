import { PactError } from "../errors";
import { log } from "../log";

// One small HTTP helper for every onchain data source: a timeout, the run's
// abort signal, clean error codes, and nothing logged beyond vendor + status.

export interface FetchOptions {
  vendor: string;
  timeoutMs: number;
  signal?: AbortSignal;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  /** Internal: the one retry after a 429 has been used. */
  retried?: boolean;
}

function combinedSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  const anySignal = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (anySignal) return anySignal([timeout, signal]);
  const controller = new AbortController();
  const abort = () => controller.abort();
  timeout.addEventListener("abort", abort, { once: true });
  signal.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

export async function fetchJson<T>(url: string, options: FetchOptions): Promise<T> {
  const { vendor, timeoutMs, signal, method = "GET", headers = {}, body } = options;
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combinedSignal(timeoutMs, signal),
    });
  } catch (error) {
    if (signal?.aborted) throw new PactError("RUN_CANCELLED", "The run was cancelled.");
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new PactError(timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE", `${vendor} did not respond${timedOut ? " in time" : ""}.`, error);
  }
  if (response.status === 429) {
    // Public APIs meter per minute; one short pause usually clears it. Counted as a second request on hosts that meter.
    if (!options.retried) {
      await new Promise((r) => setTimeout(r, 1_500));
      return fetchJson<T>(url, { ...options, retried: true });
    }
    throw new PactError("RATE_LIMITED", `${vendor} is rate-limiting requests right now.`, { status: 429 });
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    log.warn("onchain.request_failed", { provider: vendor, status: String(response.status), detail: text.slice(0, 200) });
    if (response.status === 404) throw new PactError("NOT_FOUND", `${vendor} has no record of that.`, { status: 404 });
    throw new PactError("PROVIDER_UNAVAILABLE", `${vendor} returned an error (${response.status}).`, { status: response.status });
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new PactError("MALFORMED_PROVIDER_RESPONSE", `${vendor} returned an unreadable response.`, error);
  }
}

/** JSON-RPC 2.0, single call or batch (a batch is one request, which matters on hosts that count outbound requests). */
export async function rpc<T = unknown>(url: string, calls: { method: string; params?: unknown[] | Record<string, unknown> }[], options: Omit<FetchOptions, "method" | "body">): Promise<T[]> {
  if (!calls.length) return [];
  const payload = calls.map((c, i) => ({ jsonrpc: "2.0", id: i + 1, method: c.method, params: c.params ?? [] }));
  const raw = await fetchJson<unknown>(url, { ...options, method: "POST", body: calls.length === 1 ? payload[0] : payload });
  const items = (Array.isArray(raw) ? raw : [raw]) as { id: number; result?: T; error?: { message?: string; code?: number } }[];
  const byId = new Map(items.map((item) => [item.id, item]));
  return payload.map((p) => {
    const item = byId.get(p.id);
    if (!item) throw new PactError("MALFORMED_PROVIDER_RESPONSE", `${options.vendor} skipped a request in the batch.`);
    if (item.error) {
      const message = item.error.message ?? "unknown error";
      if (/rate|too many|429/i.test(message)) throw new PactError("RATE_LIMITED", `${options.vendor} is rate-limiting requests right now.`);
      throw new PactError("PROVIDER_UNAVAILABLE", `${options.vendor}: ${message.slice(0, 160)}`, item.error);
    }
    return item.result as T;
  });
}
