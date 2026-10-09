import { fmt, toNumber } from "./table";
import type { TableData } from "./types";

// Deterministic analysis of a parsed table. Everything here is arithmetic
// in code; the model only ever explains these findings.

export interface GroupTotal {
  group: string;
  sum: number;
  mean: number;
  count: number;
}

export interface GroupBreakdown {
  by: string;
  metric: string;
  totals: GroupTotal[];
}

export interface Trend {
  period: string;
  metric: string;
  first: { label: string; value: number };
  last: { label: string; value: number };
  change: number;
  changePct: number | null;
  /** Total per period, in the order periods first appear in the file. */
  series: { label: string; value: number }[];
}

export interface Analysis {
  rowsAnalysed: number;
  rowsTotal: number;
  numeric: { name: string; count: number; sum: number; mean: number; median: number; min: number; max: number; stddev: number }[];
  groups: GroupBreakdown[];
  trends: Trend[];
  topRows: { metric: string; rows: { label: string; value: number }[] } | null;
  findings: string[];
}

const MAX_GROUP_CARDINALITY = 12;
const MAX_GROUPS_REPORTED = 8;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pct(change: number, base: number): number | null {
  return base === 0 ? null : (change / Math.abs(base)) * 100;
}

export function analyseTable(table: TableData): Analysis {
  const data = table.data;
  const numericCols = table.stats.map((s, i) => ({ ...s, index: i })).filter((s) => s.type === "number");
  const textCols = table.stats.map((s, i) => ({ ...s, index: i })).filter((s) => s.type === "text" && s.distinct >= 2 && s.distinct <= MAX_GROUP_CARDINALITY);
  const dateCols = table.stats.map((s, i) => ({ ...s, index: i })).filter((s) => s.type === "date");
  const labelCol = table.stats.findIndex((s) => s.type === "text") ;

  const numeric = numericCols.map((col) => {
    const values = data.map((r) => toNumber(r[col.index] ?? "")).filter((n): n is number => n !== null);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = values.length ? sum / values.length : 0;
    const variance = values.length ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length : 0;
    return { name: col.name, count: values.length, sum, mean, median: values.length ? median(values) : 0, min: Math.min(...values), max: Math.max(...values), stddev: Math.sqrt(variance) };
  });

  const groups: GroupBreakdown[] = [];
  for (const by of textCols.slice(0, 3)) {
    for (const metric of numericCols.slice(0, 3)) {
      const acc = new Map<string, { sum: number; count: number }>();
      for (const row of data) {
        const key = (row[by.index] ?? "").trim();
        const value = toNumber(row[metric.index] ?? "");
        if (!key || value === null) continue;
        const cur = acc.get(key) ?? { sum: 0, count: 0 };
        cur.sum += value;
        cur.count += 1;
        acc.set(key, cur);
      }
      const totals = [...acc.entries()].map(([group, v]) => ({ group, sum: v.sum, mean: v.sum / v.count, count: v.count })).sort((a, b) => b.sum - a.sum);
      if (totals.length >= 2) groups.push({ by: by.name, metric: metric.name, totals: totals.slice(0, MAX_GROUPS_REPORTED) });
    }
  }

  const trends: Trend[] = [];
  const period = dateCols[0];
  if (period) {
    // Sum each metric per period (periods repeat when a file has one row per product or region),
    // keeping the order in which periods first appear: files are usually already chronological.
    for (const metric of numericCols.slice(0, 4)) {
      const totals = new Map<string, number>();
      for (const row of data) {
        const label = (row[period.index] ?? "").trim();
        const value = toNumber(row[metric.index] ?? "");
        if (!label || value === null) continue;
        totals.set(label, (totals.get(label) ?? 0) + value);
      }
      const series = [...totals.entries()].map(([label, value]) => ({ label, value }));
      if (series.length < 2) continue;
      const first = series[0];
      const last = series[series.length - 1];
      const change = last.value - first.value;
      trends.push({ period: period.name, metric: metric.name, first, last, change, changePct: pct(change, first.value), series });
    }
  }

  const growthFindings: string[] = [];
  if (period && textCols[0] && numericCols[0]) {
    const by = textCols[0];
    const metric = numericCols[0];
    const perGroup = new Map<string, Map<string, number>>();
    for (const row of data) {
      const p = (row[period.index] ?? "").trim();
      const g = (row[by.index] ?? "").trim();
      const v = toNumber(row[metric.index] ?? "");
      if (!p || !g || v === null) continue;
      const m = perGroup.get(g) ?? new Map<string, number>();
      m.set(p, (m.get(p) ?? 0) + v);
      perGroup.set(g, m);
    }
    const growth = [...perGroup.entries()]
      .map(([g, m]) => {
        const s = [...m.values()];
        return { group: g, first: s[0], last: s[s.length - 1], change: s[s.length - 1] - s[0], pct: pct(s[s.length - 1] - s[0], s[0]) };
      })
      .filter((g) => g.first !== undefined && g.last !== undefined && perGroup.get(g.group)!.size >= 2)
      .sort((a, b) => b.change - a.change);
    if (growth.length >= 2) {
      const up = growth[0];
      const down = growth[growth.length - 1];
      growthFindings.push(`By ${by.name}, ${up.group} grew the most in ${metric.name} (${fmt(up.first)} → ${fmt(up.last)}${up.pct !== null ? `, ${up.pct >= 0 ? "+" : ""}${fmt(up.pct)}%` : ""}); ${down.group} changed the least or fell (${fmt(down.first)} → ${fmt(down.last)}${down.pct !== null ? `, ${down.pct >= 0 ? "+" : ""}${fmt(down.pct)}%` : ""}).`);
    }
  }

  let topRows: Analysis["topRows"] = null;
  if (numericCols[0] && labelCol >= 0) {
    const metric = numericCols[0];
    const rows = data
      .map((r) => ({ label: (r[labelCol] ?? "").trim(), value: toNumber(r[metric.index] ?? "") }))
      .filter((p): p is { label: string; value: number } => p.label !== "" && p.value !== null)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    if (rows.length) topRows = { metric: metric.name, rows };
  }

  const findings: string[] = [];
  if (table.rowCount > table.rowsStored) findings.push(`Only the first ${fmt(table.rowsStored)} of ${fmt(table.rowCount)} rows were analysed.`);
  for (const n of numeric.slice(0, 4)) {
    findings.push(`${n.name}: total ${fmt(n.sum)}, average ${fmt(n.mean)}, median ${fmt(n.median)}, range ${fmt(n.min)} to ${fmt(n.max)} across ${fmt(n.count)} rows.`);
  }
  for (const g of groups.slice(0, 3)) {
    const top = g.totals[0];
    const total = g.totals.reduce((a, t) => a + t.sum, 0);
    const share = total ? (top.sum / total) * 100 : null;
    findings.push(`By ${g.by}, ${top.group} has the highest ${g.metric} (${fmt(top.sum)}${share !== null ? `, ${fmt(share)}% of the total` : ""}); lowest is ${g.totals[g.totals.length - 1].group} (${fmt(g.totals[g.totals.length - 1].sum)}).`);
  }
  for (const t of trends.slice(0, 3)) {
    findings.push(`Total ${t.metric} by ${t.period}: ${t.series.map((p) => `${p.label} ${fmt(p.value)}`).join(", ")}; from ${t.first.label} to ${t.last.label} that is ${t.change >= 0 ? "up" : "down"} ${fmt(Math.abs(t.change))}${t.changePct !== null ? ` (${t.changePct >= 0 ? "+" : ""}${fmt(t.changePct)}%)` : ""}.`);
  }
  findings.push(...growthFindings);
  if (topRows && !trends.length) {
    findings.push(`Highest ${topRows.metric}: ${topRows.rows.slice(0, 3).map((r) => `${r.label} (${fmt(r.value)})`).join(", ")}.`);
  }

  return { rowsAnalysed: table.rowsStored, rowsTotal: table.rowCount, numeric, groups, trends, topRows, findings };
}

/** Text form of the analysis for the model and the rules-based report. */
export function describeAnalysis(analysis: Analysis, label: string): string {
  const lines = [`Deterministic analysis of ${label} (${fmt(analysis.rowsAnalysed)} rows):`, ...analysis.findings.map((f) => `- ${f}`)];
  for (const g of analysis.groups.slice(0, 3)) {
    lines.push(`${g.metric} by ${g.by}: ${g.totals.map((t) => `${t.group} ${fmt(t.sum)}`).join("; ")}.`);
  }
  return lines.join("\n");
}
