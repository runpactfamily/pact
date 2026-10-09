import type { RunResult } from "./types";

export function timeAgo(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${String(rest).padStart(2, "0")}s` : `${minutes}m`;
}

export function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function toMarkdown(result: RunResult): string {
  const out: string[] = [`# ${result.title}`, "", "## Executive summary", "", result.summary, ""];

  if (result.highlights?.length) {
    for (const h of result.highlights) out.push(`- **${h.value}** — ${h.label}`);
    out.push("");
  }

  for (const section of result.sections) {
    out.push(`## ${section.heading}`, "");
    for (const paragraph of section.body ?? []) out.push(paragraph, "");
    if (section.items?.length) {
      section.items.forEach((item, i) => out.push(section.ordered ? `${i + 1}. ${item}` : `- ${item}`));
      out.push("");
    }
    if (section.table) {
      out.push(`| ${section.table.columns.join(" | ")} |`);
      out.push(`| ${section.table.columns.map(() => "---").join(" | ")} |`);
      for (const row of section.table.rows) out.push(`| ${row.join(" | ")} |`);
      out.push("");
    }
  }

  out.push("## Sources", "");
  result.sources.forEach((s, i) => out.push(`${i + 1}. ${s.label}${s.detail ? ` — ${s.detail}` : ""}`));
  return out.join("\n") + "\n";
}
