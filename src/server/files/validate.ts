import { getConfig } from "../config";
import { PactError } from "../errors";
import type { FileKind } from "./types";

const KINDS: Record<string, { kind: FileKind; mime: string }> = {
  pdf: { kind: "pdf", mime: "application/pdf" },
  docx: { kind: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  csv: { kind: "csv", mime: "text/csv" },
  xlsx: { kind: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  txt: { kind: "txt", mime: "text/plain" },
  json: { kind: "json", mime: "application/json" },
  md: { kind: "md", mime: "text/markdown" },
  markdown: { kind: "md", mime: "text/markdown" },
};

export const SUPPORTED_EXTENSIONS = Object.keys(KINDS);

/** Keeps a readable name, drops paths and control characters, bounds the length. */
export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  const name = cleaned || "file";
  if (name.length <= 120) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  return name.slice(0, 120 - ext.length) + ext;
}

export function detectKind(name: string, bytes: Uint8Array): { kind: FileKind; mime: string } {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const entry = KINDS[ext];
  if (!entry) throw new PactError("UNSUPPORTED_FILE", `“.${ext || "?"}” files are not supported. Use PDF, DOCX, CSV, XLSX, TXT, JSON or MD.`);

  // Light magic-number checks: the extension must match what the bytes say.
  const head = Buffer.from(bytes.subarray(0, 4)).toString("latin1");
  if (entry.kind === "pdf" && !head.startsWith("%PDF")) throw new PactError("UNSUPPORTED_FILE", "That file is not a valid PDF.");
  if ((entry.kind === "docx" || entry.kind === "xlsx") && !head.startsWith("PK")) {
    throw new PactError("UNSUPPORTED_FILE", `That file is not a valid ${entry.kind.toUpperCase()}.`);
  }
  if (entry.kind !== "pdf" && entry.kind !== "docx" && entry.kind !== "xlsx" && bytes.subarray(0, 512).includes(0)) {
    throw new PactError("UNSUPPORTED_FILE", "That file does not look like text.");
  }
  return entry;
}

export function validateUpload(rawName: string, bytes: Uint8Array): { name: string; kind: FileKind; mime: string } {
  const { maxUploadBytes } = getConfig();
  if (bytes.byteLength === 0) throw new PactError("INVALID_REQUEST", "The file is empty.");
  if (bytes.byteLength > maxUploadBytes) {
    throw new PactError("FILE_TOO_LARGE", `Files must be ${Math.round(maxUploadBytes / (1024 * 1024))} MB or smaller.`);
  }
  const name = sanitizeFilename(rawName);
  const { kind, mime } = detectKind(name, bytes);
  return { name, kind, mime };
}
