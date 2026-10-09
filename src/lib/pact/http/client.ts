import { formatBytes } from "../format";
import type { Attachment, ChainCapabilities, ModelCatalog, PactClient, Run, RunEvent, RunInput, RunStepInfo, RunSurface } from "../types";
import { TERMINAL_STATUSES } from "../types";

// Talks to /api. Progress arrives over Server-Sent Events, with polling as a
// fallback when the stream cannot be opened.

const USER_KEY = "pact.user.v1";
const POLL_MS = 1500;

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** A stable per-browser id until real accounts exist. */
export function getUserId(): string {
  if (typeof window === "undefined") return "dev-user";
  try {
    let id = window.localStorage.getItem(USER_KEY);
    if (!id) {
      id = `u_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      window.localStorage.setItem(USER_KEY, id);
    }
    return id;
  } catch {
    return "dev-user";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "x-pact-user": getUserId(), ...(init.headers ?? {}) } });
  let body: { error?: { code: string; message: string } } & Record<string, unknown> = {};
  try {
    body = await response.json();
  } catch {
    // Non-JSON error page: fall through to the generic error below.
  }
  if (!response.ok) {
    const error = body.error ?? { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." };
    throw new ApiError(error.code, error.message, response.status);
  }
  return body as T;
}

type StreamEvent =
  | { type: "snapshot"; run: Run; steps?: RunStepInfo[] }
  | { type: "stage"; stage: Run["stage"] }
  | { type: "activity"; message: string; t?: number }
  | { type: `${"planning" | "tool" | "analysis" | "result"}.${"started" | "completed" | "failed" | "skipped"}`; step: RunStepInfo }
  | { type: "run.completed" | "run.failed" | "run.cancelled"; run: Run };

export const httpClient: PactClient = {
  async listModels() {
    return request<ModelCatalog>("/api/models");
  },

  async listChains() {
    const data = await request<{ chains: ChainCapabilities[] }>("/api/onchain/chains");
    return data.chains;
  },

  async listRuns(surface?: RunSurface) {
    const data = await request<{ runs: Run[] }>(surface ? `/api/runs?surface=${surface}` : "/api/runs");
    return data.runs;
  },

  async getRun(id) {
    try {
      const data = await request<{ run: Run }>(`/api/runs/${encodeURIComponent(id)}`);
      return data.run;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  async createRun(input: RunInput) {
    const data = await request<{ run: Run }>("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return data.run;
  },

  async cancelRun(id) {
    try {
      const data = await request<{ run: Run }>(`/api/runs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      return data.run;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  async uploadFile(file) {
    const form = new FormData();
    form.append("file", file, file.name);
    const data = await request<{ attachment: Attachment }>("/api/files", { method: "POST", body: form });
    return { ...data.attachment, detail: data.attachment.detail ?? formatBytes(file.size) };
  },

  subscribe(id, onEvent) {
    let closed = false;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (run: Run) => {
      if (run.status === "completed") onEvent({ type: "completed", run });
      else if (run.status === "failed") onEvent({ type: "failed", run });
      else if (run.status === "cancelled") onEvent({ type: "cancelled", run });
    };

    const poll = async () => {
      if (closed) return;
      try {
        const run = await httpClient.getRun(id);
        if (closed) return;
        if (run) {
          onEvent({ type: "stage", stage: run.stage });
          if (TERMINAL_STATUSES.has(run.status)) {
            finish(run);
            return;
          }
        }
      } catch {
        // Network blip: keep polling.
      }
      pollTimer = setTimeout(poll, POLL_MS);
    };

    if (typeof EventSource === "undefined") {
      void poll();
    } else {
      source = new EventSource(`/api/runs/${encodeURIComponent(id)}/events?user=${encodeURIComponent(getUserId())}`);
      source.onmessage = (message) => {
        if (closed) return;
        let event: StreamEvent;
        try {
          event = JSON.parse(message.data);
        } catch {
          return;
        }
        if (event.type === "snapshot") {
          for (const step of event.steps ?? []) onEvent({ type: "step", step });
          onEvent({ type: "stage", stage: event.run.stage });
          if (TERMINAL_STATUSES.has(event.run.status)) finish(event.run);
          return;
        }
        if (event.type === "stage" || event.type === "activity") onEvent(event);
        else if (event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled") finish(event.run);
        else if ("step" in event) onEvent({ type: "step", step: event.step });
      };
      source.onerror = () => {
        // The stream closes when the run ends; if it drops earlier, fall back to polling.
        source?.close();
        source = null;
        if (!closed) void poll();
      };
    }

    return () => {
      closed = true;
      source?.close();
      if (pollTimer) clearTimeout(pollTimer);
    };
  },
};
