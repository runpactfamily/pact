// The contract between the UI and the Pact backend. The HTTP client is the
// only PactClient; the server's public run shape is `Run`.

export const RUN_STAGES = [
  "understanding",
  "analyzing",
  "researching",
  "working",
  "done",
] as const;

export type RunStage = (typeof RUN_STAGES)[number];

export const STAGE_LABELS: Record<RunStage, string> = {
  understanding: "Understanding",
  analyzing: "Analyzing",
  researching: "Researching",
  working: "Working",
  done: "Done",
};

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export const STATUS_LABELS: Record<RunStatus, string> = {
  queued: "Queued",
  running: "In progress",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export type AttachmentKind = "file" | "link" | "github";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  label: string;
  detail?: string;
  /** Set once a file has been uploaded to the backend. */
  fileId?: string;
}

export type ModelVendor = "openrouter" | "gemini" | "groq";

export type ModelSelection = { mode: "auto" } | { mode: "manual"; provider: ModelVendor; model: string };

export interface ModelOption {
  id: string;
  name: string;
  contextLength?: number;
  /** USD per million tokens, when published. */
  pricing?: { input: number; output: number };
}

export interface ModelCatalog {
  fetchedAt: number;
  vendors: { vendor: ModelVendor; available: boolean; reason?: string; models: ModelOption[] }[];
}

export type RunSurface = "app" | "onchain";

export const CHAIN_IDS = ["robinhood", "base", "bnb", "solana"] as const;
export type ChainId = (typeof CHAIN_IDS)[number];

/** What a chain can do with the keys the server has. */
export interface ChainCapabilities {
  id: ChainId;
  name: string;
  family: "evm" | "solana";
  nativeSymbol: string;
  explorer: boolean;
  market: boolean;
  security: boolean;
  vendors?: string[];
  notes: string[];
}

export interface RunInput {
  task: string;
  attachments: Attachment[];
  model?: ModelSelection;
  /** Which product surface the run comes from. Defaults to the app. */
  surface?: RunSurface;
  /** Default chain for an onchain run. */
  chain?: ChainId;
}

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

/** A step as the run stream reports it. Only names, tools and statuses; never model output. */
export interface RunStepInfo {
  id: string;
  name: string;
  kind: "plan" | "tool" | "evaluate" | "synthesize";
  tool?: string;
  status: StepStatus;
  stage: RunStage;
  startedAt?: number;
  completedAt?: number;
  error?: RunError;
}

export interface ResultTable {
  columns: string[];
  rows: string[][];
}

export interface ResultSection {
  heading: string;
  tone?: "default" | "risk" | "recommendation";
  body?: string[];
  items?: string[];
  ordered?: boolean;
  table?: ResultTable;
}

export interface ResultHighlight {
  value: string;
  label: string;
}

export interface ResultSource {
  kind: AttachmentKind | "reference";
  label: string;
  detail?: string;
}

export interface RunResult {
  title: string;
  summary: string;
  highlights?: ResultHighlight[];
  sections: ResultSection[];
  sources: ResultSource[];
}

export interface RunError {
  code: string;
  message: string;
}

export interface ActivityEntry {
  /** Milliseconds since the run started. */
  t: number;
  message: string;
}

export interface Run {
  id: string;
  title: string;
  task: string;
  attachments: Attachment[];
  status: RunStatus;
  stage: RunStage;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  result?: RunResult;
  error?: RunError;
  activity?: ActivityEntry[];
  /** Web and repository sources the run retrieved. */
  sources?: { title: string; url?: string; provider: string; kind: string; retrievedAt: string; publishedAt?: string }[];
  /** What was asked for and how it was routed. Safe metadata only. */
  selection?: ModelSelection;
  routing?: { mode: "auto" | "manual"; tier: "light" | "medium" | "heavy" | "complex"; vendor: string; model: string; chain: string[] };
  /** Model that produced (or is producing) the result, with a display label. */
  llm?: { vendor: string; model: string; label?: string };
  surface?: RunSurface;
  chain?: ChainId;
}

export type RunEvent =
  | { type: "stage"; stage: RunStage }
  | { type: "activity"; message: string; t?: number }
  | { type: "step"; step: RunStepInfo }
  | { type: "completed"; run: Run }
  | { type: "failed"; run: Run }
  | { type: "cancelled"; run: Run };

export const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set(["completed", "failed", "cancelled"]);

export interface PactClient {
  listModels(): Promise<ModelCatalog>;
  listChains(): Promise<ChainCapabilities[]>;
  listRuns(surface?: RunSurface): Promise<Run[]>;
  getRun(id: string): Promise<Run | null>;
  createRun(input: RunInput): Promise<Run>;
  cancelRun(id: string): Promise<Run | null>;
  /** Uploads a file and returns the attachment to put on a run. */
  uploadFile(file: File): Promise<Attachment>;
  /** Streams progress for a run. Returns an unsubscribe function. */
  subscribe(id: string, onEvent: (event: RunEvent) => void): () => void;
}
