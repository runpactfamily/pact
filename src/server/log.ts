// Structured logging: one JSON object per line on stdout/stderr. Callers pass
// identifiers and numbers, never documents, prompts, or credentials.

type Level = "info" | "warn" | "error";

export interface LogFields {
  runId?: string;
  stepId?: string;
  tool?: string;
  provider?: string;
  status?: string;
  durationMs?: number;
  code?: string;
  [key: string]: unknown;
}

const SILENT = process.env.PACT_LOG === "silent" || process.env.NODE_ENV === "test";

function write(level: Level, event: string, fields: LogFields = {}) {
  if (SILENT) return;
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    safe[k] = v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : String(v);
  }
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...safe });
  if (level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

/** "Name: message", followed by the same for each nested cause (PactError.detail or Error.cause). */
function describe(error: unknown, depth = 0): string | undefined {
  if (error === undefined) return undefined;
  if (!(error instanceof Error)) return String(error);
  const nested = (error as { detail?: unknown }).detail ?? error.cause;
  const own = `${error.name}: ${error.message}`;
  return nested !== undefined && depth < 3 ? `${own} ← ${describe(nested, depth + 1)}` : own;
}

export const log = {
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields & { error?: unknown }) => {
    const { error, ...rest } = fields ?? {};
    write("error", event, { ...rest, detail: describe(error) });
  },
};
