import type { ClientError } from "../errors";
import type { ModelSelection, TaskTier } from "../providers/types";
import type { Attachment, RunResult, RunStage } from "@/lib/pact/types";

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type StepType = "plan" | "tool" | "evaluate" | "synthesize";

export interface StepRecord {
  id: string;
  runId: string;
  type: StepType;
  name: string;
  status: StepStatus;
  stage: RunStage;
  startedAt?: number;
  completedAt?: number;
  /** Sanitized, size-bounded. */
  input?: Record<string, unknown>;
  /** Metadata only: counts, titles, lengths. Never full documents. */
  output?: Record<string, unknown>;
  error?: ClientError;
}

export interface ToolCallRecord {
  id: string;
  runId: string;
  stepId: string;
  tool: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: ClientError;
}

export interface SourceRecord {
  title: string;
  url?: string;
  provider: string;
  kind: "search" | "page" | "repo" | "chain";
  retrievedAt: string;
  publishedAt?: string;
}

export interface RunRecord {
  id: string;
  userId: string;
  title: string;
  job: string;
  attachments: Attachment[];
  status: RunStatus;
  stage: RunStage;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: RunResult;
  error?: ClientError;
  steps: StepRecord[];
  toolCalls: ToolCallRecord[];
  /** High-level activity lines shown while running. */
  activity: { t: number; message: string }[];
  /** Web and repository sources the run retrieved. */
  sources: SourceRecord[];
  /** What the user asked for: automatic routing or a specific model. */
  selection: ModelSelection;
  /** How the run was routed. Safe metadata only. */
  routing?: { mode: "auto" | "manual"; tier: TaskTier; vendor: string; model: string; chain: string[] };
  /** Model that actually produced the result. Safe metadata only. */
  llm?: { vendor: string; model: string };
  /** Which product surface created the run. Decides the tool set. Absent means "app". */
  surface?: "app" | "onchain";
  /** Default chain chosen in the onchain composer. */
  chain?: string;
}

export type RunEvent =
  | { type: "stage"; runId: string; stage: RunStage }
  | { type: "activity"; runId: string; message: string; t: number }
  | { type: "step"; runId: string; step: StepRecord }
  | { type: "completed"; runId: string; run: RunRecord }
  | { type: "failed"; runId: string; run: RunRecord }
  | { type: "cancelled"; runId: string; run: RunRecord };

export const TERMINAL: ReadonlySet<RunStatus> = new Set(["completed", "failed", "cancelled"]);

const TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
