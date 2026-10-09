// Errors that are safe to show. Anything else becomes INTERNAL_ERROR at the
// API boundary and is logged in full on the server.

export type ErrorCode =
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "UNSUPPORTED_FILE"
  | "FILE_TOO_LARGE"
  | "PROVIDER_UNAVAILABLE"
  | "AGENT_PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "RATE_LIMITED"
  | "MALFORMED_PROVIDER_RESPONSE"
  | "AGENT_FAILURE"
  | "STEP_LIMIT_REACHED"
  | "RUN_CANCELLED"
  | "RUN_INTERRUPTED"
  | "STORAGE_FAILURE"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  UNSUPPORTED_FILE: 415,
  FILE_TOO_LARGE: 413,
  PROVIDER_UNAVAILABLE: 503,
  AGENT_PROVIDER_UNAVAILABLE: 503,
  PROVIDER_TIMEOUT: 504,
  RATE_LIMITED: 429,
  MALFORMED_PROVIDER_RESPONSE: 502,
  AGENT_FAILURE: 500,
  STEP_LIMIT_REACHED: 500,
  RUN_CANCELLED: 409,
  RUN_INTERRUPTED: 500,
  STORAGE_FAILURE: 500,
  INTERNAL_ERROR: 500,
};

export class PactError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Server-only detail. Never sent to the client. */
  readonly detail?: unknown;

  constructor(code: ErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "PactError";
    this.code = code;
    this.status = STATUS[code];
    this.detail = detail;
  }
}

export interface ClientError {
  code: ErrorCode;
  message: string;
}

export function toClientError(error: unknown): ClientError {
  if (error instanceof PactError) return { code: error.code, message: error.message };
  return { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." };
}

export function isPactError(error: unknown, code?: ErrorCode): error is PactError {
  return error instanceof PactError && (code === undefined || error.code === code);
}

/** Failures worth retrying on another provider: outages, limits, timeouts, junk responses. Not bad input. */
export function isRecoverableProviderError(error: unknown): boolean {
  return (
    error instanceof PactError &&
    (error.code === "PROVIDER_UNAVAILABLE" || error.code === "PROVIDER_TIMEOUT" || error.code === "RATE_LIMITED" || error.code === "MALFORMED_PROVIDER_RESPONSE")
  );
}
