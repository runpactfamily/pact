// Compact, deterministic number formatting for evidence lines.

export function fmtUsd(value: number | string | null | undefined, digits = 2): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (Math.abs(n) >= 1) return `$${n.toFixed(digits)}`;
  if (n === 0) return "$0";
  // Small prices: keep the significant digits.
  return `$${n.toPrecision(4)}`;
}

export function fmtNum(value: number | string | null | undefined, digits = 2): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

export function fmtPct(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

/** Raw integer amount (string or bigint) to a decimal number. Precision beyond ~15 digits is dropped on purpose. */
export function fromUnits(raw: string | number | bigint | null | undefined, decimals: number): number {
  if (raw === null || raw === undefined) return 0;
  try {
    const big = typeof raw === "bigint" ? raw : BigInt(typeof raw === "number" ? Math.trunc(raw) : raw.startsWith("0x") ? raw : raw.split(".")[0]);
    const base = 10n ** BigInt(decimals);
    const whole = big / base;
    const frac = big % base;
    return Number(whole) + Number(frac) / Number(base);
  } catch {
    return 0;
  }
}

export function ago(ms: number | null | undefined): string {
  if (!ms) return "unknown";
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function shortAddr(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
