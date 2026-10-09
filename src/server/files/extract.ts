import { getConfig } from "../config";
import { isWorkers } from "../runtime";
import { PactError } from "../errors";
import { sanitizeText } from "../utils/text";
import { buildTable, detectDelimiter, parseCsv } from "./table";
import type { DocumentRepresentation, FileKind, PdfPage, TableData } from "./types";

// Local extraction. Nothing here calls an external AI service; the libraries
// run in-process on the uploaded bytes, under a timeout.

const MAX_TEXT = 200_000;
const MAX_SHEETS = 12;
const MAX_ROWS_IN_TEXT = 100;

export interface Extracted {
  text: string;
  table?: TableData;
  tables?: TableData[];
  pages?: PdfPage[];
  meta: DocumentRepresentation["meta"];
}

export const PDF_NO_TEXT = "Text extraction unavailable for this PDF. It appears to contain images only; no OCR is implemented.";

// pdf.js expects a few browser canvas globals at load time. Text extraction
// never draws, so on runtimes without them (Cloudflare Workers) inert stand-ins
// are enough.
async function ensurePdfGlobals() {
  const g = globalThis as Record<string, unknown>;
  // pdf.js normally loads its worker module from a path at runtime; a bundled
  // Worker has no such file, so hand it the module directly.
  if (isWorkers() && !g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      constructor(init?: number[]) {
        if (Array.isArray(init) && init.length >= 6) [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
    };
  }
  if (typeof g.Path2D === "undefined") g.Path2D = class Path2D {};
  if (typeof g.ImageData === "undefined") g.ImageData = class ImageData {};
}

async function fromPdf(bytes: Uint8Array): Promise<Extracted> {
  await ensurePdfGlobals();
  const { PDFParse } = await import("pdf-parse");
  let parser: InstanceType<typeof PDFParse>;
  try {
    // pdf.js transfers the buffer to its worker, which would detach the caller's bytes; hand it a copy.
    parser = new PDFParse({ data: bytes.slice() });
  } catch (error) {
    throw new PactError("UNSUPPORTED_FILE", "That PDF could not be opened.", error);
  }
  try {
    const result = await parser.getText();
    const pages: PdfPage[] = (result.pages ?? []).map((p, i) => ({ pageNumber: p.num ?? i + 1, text: sanitizeText(p.text ?? "", MAX_TEXT) }));
    const joined = pages.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join("\n\n");
    const text = sanitizeText(joined, MAX_TEXT);
    const chars = pages.reduce((a, p) => a + p.text.length, 0);
    const meta: Extracted["meta"] = { pages: result.total ?? pages.length, chars };
    if (chars < 20) meta.textUnavailable = PDF_NO_TEXT;
    return { text: chars < 20 ? PDF_NO_TEXT : text, pages, meta };
  } catch (error) {
    const name = (error as { name?: string })?.name ?? "";
    const message = (error as { message?: string })?.message ?? "";
    if (/password/i.test(name) || /password|encrypt/i.test(message)) throw new PactError("UNSUPPORTED_FILE", "That PDF is password-protected and cannot be read.");
    throw error;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/** mammoth's HTML → readable structured text: headings, paragraphs, lists, tables. */
export function htmlToStructuredText(html: string): { text: string; headings: string[] } {
  const headings: string[] = [];
  const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  const strip = (s: string) => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  let out = html
    .replace(/<table[\s\S]*?<\/table>/gi, (table) => {
      const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => strip(c[1])).join(" | "));
      return `\n${rows.join("\n")}\n`;
    })
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, inner: string) => {
      const title = strip(inner);
      if (title) headings.push(title);
      return `\n${"#".repeat(Number(level))} ${title}\n`;
    })
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner: string) => `\n- ${strip(inner)}`)
    .replace(/<\/(p|div|ul|ol|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  out = decode(out.replace(/<[^>]+>/g, ""));
  return { text: sanitizeText(out, MAX_TEXT), headings: headings.slice(0, 50) };
}

async function fromDocx(bytes: Uint8Array): Promise<Extracted> {
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
  const { text, headings } = htmlToStructuredText(result.value);
  return { text, meta: { chars: text.length, headings } };
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    return "";
  }
  return String(value);
}

async function fromXlsx(bytes: Uint8Array): Promise<Extracted> {
  const mod = (await import("exceljs")) as unknown as { default?: typeof import("exceljs") } & typeof import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  const sheets = workbook.worksheets.map((w) => w.name);
  if (!workbook.worksheets.length) throw new PactError("UNSUPPORTED_FILE", "The workbook has no sheets.");
  const tables: TableData[] = [];
  const textParts: string[] = [];
  for (const sheet of workbook.worksheets.slice(0, MAX_SHEETS)) {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as unknown[];
      rows.push(values.slice(1).map(cellText));
    });
    if (!rows.length) continue;
    tables.push(buildTable(rows, sheet.name));
    textParts.push(`## Sheet: ${sheet.name}\n${rows.slice(0, MAX_ROWS_IN_TEXT).map((r) => r.join(", ")).join("\n")}`);
  }
  if (!tables.length) throw new PactError("UNSUPPORTED_FILE", "The workbook has no data.");
  const text = sanitizeText(textParts.join("\n\n"), MAX_TEXT);
  return { text, table: tables[0], tables, meta: { chars: text.length, sheets } };
}

function fromCsv(bytes: Uint8Array): Extracted {
  const raw = Buffer.from(bytes).toString("utf8").replace(/^﻿/, "");
  const rows = parseCsv(raw, detectDelimiter(raw));
  if (rows.length < 1) throw new PactError("UNSUPPORTED_FILE", "The CSV file has no rows.");
  const table = buildTable(rows);
  const text = sanitizeText(rows.slice(0, MAX_ROWS_IN_TEXT).map((r) => r.join(", ")).join("\n"), MAX_TEXT);
  return { text, table, tables: [table], meta: { chars: text.length } };
}

function fromJson(bytes: Uint8Array): Extracted {
  const raw = Buffer.from(bytes).toString("utf8").replace(/^﻿/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PactError("UNSUPPORTED_FILE", "That JSON file could not be parsed.");
  }
  // An array of flat objects is a table; anything else is pretty-printed text.
  if (Array.isArray(parsed) && parsed.length && parsed.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
    const objects = parsed as Record<string, unknown>[];
    const columns = [...new Set(objects.flatMap((o) => Object.keys(o)))];
    const rows = [columns, ...objects.map((o) => columns.map((c) => (o[c] === undefined || o[c] === null ? "" : typeof o[c] === "object" ? JSON.stringify(o[c]) : String(o[c]))))];
    const table = buildTable(rows);
    const text = sanitizeText(JSON.stringify(parsed.slice(0, 100), null, 1), MAX_TEXT);
    return { text, table, tables: [table], meta: { chars: text.length } };
  }
  const text = sanitizeText(JSON.stringify(parsed, null, 1), MAX_TEXT);
  return { text, meta: { chars: text.length } };
}

function fromText(bytes: Uint8Array): Extracted {
  const text = sanitizeText(Buffer.from(bytes).toString("utf8").replace(/^﻿/, ""), MAX_TEXT);
  const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1].trim()).slice(0, 50);
  return { text, meta: { chars: text.length, ...(headings.length ? { headings } : {}) } };
}

async function run(kind: FileKind, bytes: Uint8Array): Promise<Extracted> {
  switch (kind) {
    case "pdf":
      return fromPdf(bytes);
    case "docx":
      return fromDocx(bytes);
    case "xlsx":
      return fromXlsx(bytes);
    case "csv":
      return fromCsv(bytes);
    case "json":
      return fromJson(bytes);
    case "txt":
    case "md":
      return fromText(bytes);
  }
}

export async function extract(kind: FileKind, bytes: Uint8Array): Promise<Extracted> {
  const timeoutMs = getConfig().limits.parserTimeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PactError("UNSUPPORTED_FILE", `The ${kind.toUpperCase()} file took too long to read.`)), timeoutMs);
  });
  try {
    return await Promise.race([run(kind, bytes), timeout]);
  } catch (error) {
    if (error instanceof PactError) throw error;
    throw new PactError("UNSUPPORTED_FILE", `The ${kind.toUpperCase()} file could not be read.`, error);
  } finally {
    clearTimeout(timer);
  }
}
