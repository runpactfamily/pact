// Text helpers shared by tools, file extraction and the local synthesizer.

/** Strips control characters and collapses whitespace. External content passes through here. */
export function sanitizeText(input: string, maxChars = 40_000): string {
  const cleaned = input
    .replace(/\r\n?/g, "\n")
    // Control characters except tab and newline.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars)}\n…[truncated]` : cleaned;
}

export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && s.length <= 400);
}

const STOP = new Set(
  "a an and are as at be by for from has have in into is it its of on or that the this to was were will with what which who how why when where tell me us our your you we they their them i about these those can should would could does do did not no yes".split(" "),
);

export function keywords(text: string): string[] {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) ?? []) {
    const word = raw.replace(/'s$/, "");
    if (STOP.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
}

/** Scores a sentence by how many of the query keywords it contains. */
export function relevance(sentence: string, terms: string[]): number {
  const lower = sentence.toLowerCase();
  let score = 0;
  for (const term of terms) if (lower.includes(term)) score += 1;
  return score;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40))}…`;
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
