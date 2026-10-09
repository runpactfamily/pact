import { createHash } from "node:crypto";
import type { Evidence } from "../tools/types";
import { relevance, truncate } from "../utils/text";

// Assembles what the model is allowed to see: deduplicated, ranked by
// relevance to the job, trimmed per source and in total, with [n] labels
// preserved so the result can cite its sources.

export interface PackedEvidence extends Evidence {
  /** 1-based citation label used in the prompt and the result. */
  ref: number;
  /** Characters kept after trimming. */
  chars: number;
}

export interface AssembledContext {
  items: PackedEvidence[];
  chars: number;
  dropped: number;
  trimmed: number;
}

export interface ContextLimits {
  maxSourceChars: number;
  maxContextChars: number;
}

// User-provided material outranks what tools found on the web.
const KIND_PRIORITY: Record<Evidence["kind"], number> = { analysis: 6, table: 5, calc: 5, file: 4, chain: 4, repo: 3, page: 2, search: 1 };

function fingerprint(e: Evidence): string {
  // Chain evidence from different tools often shares one explorer link; the label says which tool produced it.
  if (e.kind === "chain") return `chain:${e.label}`;
  if (e.url) return `url:${e.url.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase()}`;
  return `text:${createHash("sha1").update(`${e.label}\n${e.text.slice(0, 500)}`).digest("hex")}`;
}

/** Keeps the paragraphs that mention the job most, in document order, within a budget. */
export function trimToRelevant(text: string, terms: string[], max: number): string {
  if (text.length <= max) return text;
  const paragraphs = text.split(/\n{2,}|\n(?=#{1,6}\s)|\n(?=\[Page \d+\])/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= 1) return truncate(text, max);
  const scored = paragraphs.map((p, i) => ({ i, p, score: relevance(p, terms) + (i === 0 ? 1 : 0) }));
  const chosen = new Set<number>();
  let used = 0;
  for (const s of [...scored].sort((a, b) => b.score - a.score || a.i - b.i)) {
    const cost = Math.min(s.p.length, max) + 2;
    if (used + cost > max) continue;
    chosen.add(s.i);
    used += cost;
    if (used >= max * 0.95) break;
  }
  if (!chosen.size) return truncate(text, max);
  const render = () => {
    const out: string[] = [];
    let last = -1;
    for (const s of scored) {
      if (!chosen.has(s.i)) continue;
      if (last >= 0 && s.i !== last + 1) out.push("[…]");
      out.push(truncate(s.p, max));
      last = s.i;
    }
    return out.join("\n\n");
  };
  // Separators and gap markers were not budgeted: shed the weakest paragraphs until it fits.
  let result = render();
  while (result.length > max && chosen.size > 1) {
    const weakest = [...chosen].map((i) => scored[i]).sort((x, y) => x.score - y.score || y.i - x.i)[0];
    chosen.delete(weakest.i);
    result = render();
  }
  return result.length > max ? truncate(result, max) : result;
}

export function assembleContext(evidence: Evidence[], terms: string[], limits: ContextLimits): AssembledContext {
  // 1. Dedupe: same URL or same text keeps the first (richer kinds come first after ranking).
  const seen = new Set<string>();
  const unique: Evidence[] = [];
  let dropped = 0;
  const ranked = [...evidence].sort((a, b) => KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind] || relevance(`${b.label} ${b.text.slice(0, 2000)}`, terms) - relevance(`${a.label} ${a.text.slice(0, 2000)}`, terms));
  for (const e of ranked) {
    const key = fingerprint(e);
    if (seen.has(key)) {
      dropped++;
      continue;
    }
    seen.add(key);
    unique.push(e);
  }

  // 2. Trim per source, then stop when the total budget is spent.
  const items: PackedEvidence[] = [];
  let chars = 0;
  let trimmed = 0;
  for (const e of unique) {
    const remaining = limits.maxContextChars - chars;
    if (remaining < 200) {
      dropped++;
      continue;
    }
    const cap = Math.min(limits.maxSourceChars, remaining);
    const text = trimToRelevant(e.text, terms, cap);
    if (text.length < e.text.length) trimmed++;
    items.push({ ...e, text, ref: items.length + 1, chars: text.length });
    chars += text.length;
  }
  return { items, chars, dropped, trimmed };
}

export function renderContext(context: AssembledContext): string {
  return context.items
    .map((e) => `[${e.ref}] ${e.kind.toUpperCase()} ${e.label}${e.url ? ` <${e.url}>` : ""}${e.publishedAt ? ` (published ${e.publishedAt})` : ""}\n${e.text}`)
    .join("\n\n");
}
