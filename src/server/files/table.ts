import type { ColumnStats, TableData } from "./types";

// Deterministic table handling. Parsing and statistics happen here in code,
// never in a model.

const MAX_ROWS_SHOWN = 50;
const MAX_ROWS_STORED = 5000;
const MAX_COLUMNS = 200;

/** RFC 4180-style CSV parser: quotes, escaped quotes, newlines inside quotes. */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export function detectDelimiter(sample: string): string {
  const candidates = [",", ";", "\t", "|"];
  const firstLine = sample.split(/\r?\n/)[0] ?? "";
  let best = ",";
  let bestCount = 0;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export function toNumber(value: string): number | null {
  const cleaned = value.replace(/[,\s$€£%]/g, "");
  if (cleaned === "" || !/^-?\d*\.?\d+(e-?\d+)?$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const DATE_RE = /^(\d{4}-\d{2}(-\d{2})?|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}|(q[1-4]|h[12])[\s-]?\d{4}|\d{4}[\s-]?(q[1-4]|h[12])|(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*\d{2,4})$/i;

export function looksLikeDate(value: string): boolean {
  return DATE_RE.test(value.trim());
}

export function buildTable(rows: string[][], sheet?: string): TableData {
  const [header = [], ...body] = rows;
  const columns = header.slice(0, MAX_COLUMNS).map((h, i) => (h.trim() ? h.trim() : `column_${i + 1}`));
  const stats: ColumnStats[] = columns.map((name, c) => {
    const values = body.map((r) => (r[c] ?? "").trim());
    const nonEmpty = values.filter((v) => v !== "");
    const numbers = nonEmpty.map(toNumber).filter((n): n is number => n !== null);
    const numeric = nonEmpty.length > 0 && numbers.length === nonEmpty.length;
    const dateLike = !numeric && nonEmpty.length > 0 && nonEmpty.every(looksLikeDate);
    const yearLike = numeric && /year|date|period/i.test(name);
    const distinct = new Set(nonEmpty).size;
    const base: ColumnStats = {
      name,
      type: nonEmpty.length === 0 ? "empty" : dateLike || yearLike ? "date" : numeric ? "number" : "text",
      nonEmpty: nonEmpty.length,
      distinct,
      sample: [...new Set(nonEmpty)].slice(0, 5),
    };
    if (numeric && !yearLike) {
      const sum = numbers.reduce((a, b) => a + b, 0);
      base.min = Math.min(...numbers);
      base.max = Math.max(...numbers);
      base.sum = sum;
      base.mean = sum / numbers.length;
    }
    return base;
  });
  const data = body.slice(0, MAX_ROWS_STORED).map((r) => r.slice(0, MAX_COLUMNS));
  return { columns, rowCount: body.length, rows: data.slice(0, MAX_ROWS_SHOWN), data, rowsStored: data.length, stats, sheet };
}

export function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** A compact, factual description a model or a person can read. */
export function describeTable(table: TableData): string {
  const lines = [
    `${table.sheet ? `Sheet “${table.sheet}”: ` : ""}${table.rowCount.toLocaleString("en-US")} rows × ${table.columns.length} columns.`,
    `Columns: ${table.columns.join(", ")}.`,
  ];
  for (const s of table.stats) {
    if (s.type === "number") {
      lines.push(`${s.name}: numeric, ${s.nonEmpty} values, min ${fmt(s.min!)}, max ${fmt(s.max!)}, mean ${fmt(s.mean!)}, sum ${fmt(s.sum!)}.`);
    } else if (s.type === "date") {
      lines.push(`${s.name}: period/date, ${s.distinct} distinct (${s.sample.slice(0, 3).join("; ")}).`);
    } else if (s.type === "text") {
      lines.push(`${s.name}: text, ${s.nonEmpty} values, ${s.distinct} distinct${s.sample.length ? ` (e.g. ${s.sample.slice(0, 3).join("; ")})` : ""}.`);
    } else lines.push(`${s.name}: empty.`);
  }
  if (table.rows.length) {
    lines.push("First rows:");
    for (const row of table.rows.slice(0, 5)) lines.push(row.join(" | "));
  }
  return lines.join("\n");
}
