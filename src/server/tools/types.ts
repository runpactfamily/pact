import type { Providers } from "../providers/types";

// A tool is a named capability with a declared input/output shape. The agent
// only ever sees this contract; the provider behind it is an implementation
// detail of the tool.

export type JsonSchema = {
  type: "object";
  properties: Record<string, { type: string; description?: string; enum?: string[]; items?: { type: string } }>;
  required?: string[];
};

export type ToolStage = "understanding" | "analyzing" | "researching" | "working";

export interface ToolAvailability {
  available: boolean;
  reason?: string;
}

export interface ToolContext {
  runId: string;
  userId: string;
  providers: Providers;
  signal: AbortSignal;
  timeoutMs: number;
}

export interface ToolOutput<T = unknown> {
  /** Structured result, kept with the tool call record (metadata only is stored). */
  data: T;
  /** Short line shown to the user as activity, e.g. "Found 5 results". */
  summary: string;
  /** Evidence the synthesizer may quote from. Already sanitized. */
  evidence?: Evidence[];
}

export interface Evidence {
  kind: "search" | "page" | "file" | "repo" | "calc" | "table" | "analysis" | "chain";
  label: string;
  url?: string;
  text: string;
  /** Vendor or parser that produced it, for source records. */
  provider?: string;
  publishedAt?: string;
}

export interface Tool<I = Record<string, unknown>, O = unknown> {
  name: string;
  description: string;
  /** Which high-level stage the UI should show while this tool runs. */
  stage: ToolStage;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  /** Development-only tools may be marked planned so they appear in the registry without running. */
  planned?: boolean;
  isAvailable(providers: Providers): ToolAvailability;
  execute(input: I, context: ToolContext): Promise<ToolOutput<O>>;
}
