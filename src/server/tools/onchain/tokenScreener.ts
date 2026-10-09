import { PactError } from "../../errors";
import { ago, fmtNum, fmtPct, fmtUsd } from "../../onchain/format";
import type { CodexTokenMetrics, ScreenerRanking } from "../../onchain/sources/codex";
import type { Tool } from "../types";
import { CHAIN_PROPERTY, evidence, requireChain, sourceOptions } from "./shared";

interface Input {
  chain: string;
  rankBy?: ScreenerRanking;
  minLiquidityUsd?: number;
  minVolume24Usd?: number;
  maxAgeHours?: number;
  minHolders?: number;
  maxTop10Pct?: number;
  minMarketCapUsd?: number;
  maxMarketCapUsd?: number;
  launchpad?: "any" | "only" | "graduated" | "none";
  launchpadName?: string;
  includeScams?: boolean;
  limit?: number;
}

const COLUMNS = ["Token", "Price", "24h", "Mcap", "Liquidity", "Vol 24h", "Holders", "Top10", "Age", "Snipers", "Insiders", "Dev", "Launchpad", "Flags"];

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "n/a" : `${v.toFixed(1)}%`);

export function screenerRow(m: CodexTokenMetrics, now: number): string[] {
  return [
    m.symbol ?? m.address.slice(0, 8),
    fmtUsd(m.priceUsd),
    fmtPct(m.change24),
    fmtUsd(m.marketCap),
    fmtUsd(m.liquidityUsd),
    fmtUsd(m.volume24),
    m.holders !== undefined ? fmtNum(m.holders) : "n/a",
    pct(m.top10HoldersPct),
    m.createdAt ? ago(m.createdAt) : "n/a",
    pct(m.sniperHeldPct),
    pct(m.insiderHeldPct),
    pct(m.devHeldPct),
    m.launchpad?.name ? `${m.launchpad.name}${m.launchpad.completed ? " (graduated)" : m.launchpad.graduationPct !== null && m.launchpad.graduationPct !== undefined ? ` ${m.launchpad.graduationPct.toFixed(0)}%` : ""}` : "-",
    m.isScam ? "SCAM" : m.potentialScamReasons.length ? m.potentialScamReasons.join(",") : "-",
  ];
  void now;
}

export const tokenScreenerTool: Tool<Input, { chain: string; count: number; columns: string[]; table: string[][]; tokens: CodexTokenMetrics[] }> = {
  name: "token_screener",
  description: "Screen tokens on a chain by criteria (liquidity, volume, age, holders, top-10 share, market cap, launchpad stage) ranked by trending, volume, holders, 24h change, newest, liquidity, market cap or graduation progress; each row carries sniper, insider, bundler and developer shares and scam flags.",
  stage: "researching",
  inputSchema: {
    type: "object",
    properties: {
      chain: CHAIN_PROPERTY,
      rankBy: { type: "string", enum: ["trending", "volume24", "holders", "change24", "newest", "liquidity", "marketCap", "graduation"], description: "default trending; graduation = closest to leaving a launchpad bonding curve" },
      minLiquidityUsd: { type: "number", description: "default 10000" },
      minVolume24Usd: { type: "number" },
      maxAgeHours: { type: "number", description: "only tokens created within this many hours" },
      minHolders: { type: "number" },
      maxTop10Pct: { type: "number", description: "max share held by the top 10 wallets, e.g. 40" },
      minMarketCapUsd: { type: "number" },
      maxMarketCapUsd: { type: "number" },
      launchpad: { type: "string", enum: ["any", "only", "graduated", "none"], description: "only = still on a launchpad bonding curve; graduated = completed; none = never launched via a launchpad" },
      launchpadName: { type: "string", description: "e.g. Pump.fun" },
      includeScams: { type: "boolean", description: "default false: tokens flagged as potential scams are left out" },
      limit: { type: "number", description: "1–25 (default 10)" },
    },
    required: ["chain"],
  },
  outputSchema: { type: "object", properties: { count: { type: "number" }, table: { type: "array", items: { type: "array" } } } },
  isAvailable: () => ({ available: true }),
  async execute(input, context) {
    const { info, clients } = requireChain(input.chain);
    if (!clients.codex || !clients.codexNetwork) throw new PactError("PROVIDER_UNAVAILABLE", `The token screener needs CODEX_API_KEY; it is not configured for ${info.name}.`);
    const options = sourceOptions(context);
    const limit = Math.min(25, Math.max(1, Math.floor(input.limit ?? 10)));
    const rankBy: ScreenerRanking = input.rankBy ?? "trending";
    const filters = {
      minLiquidityUsd: input.minLiquidityUsd ?? 10_000,
      minVolume24Usd: input.minVolume24Usd,
      maxAgeHours: input.maxAgeHours,
      minHolders: input.minHolders,
      maxTop10Pct: input.maxTop10Pct,
      minMarketCapUsd: input.minMarketCapUsd,
      maxMarketCapUsd: input.maxMarketCapUsd,
      launchpad: input.launchpad ?? "any",
      launchpadName: input.launchpadName,
      excludeScams: !input.includeScams,
    };
    const rows = await clients.codex.screen(clients.codexNetwork, filters, rankBy, limit, options);
    const now = Date.now();
    const table = rows.map((m) => screenerRow(m, now));
    const criteria = [
      `liquidity ≥ ${fmtUsd(filters.minLiquidityUsd)}`,
      filters.minVolume24Usd ? `24h volume ≥ ${fmtUsd(filters.minVolume24Usd)}` : "",
      filters.maxAgeHours ? `age ≤ ${filters.maxAgeHours}h` : "",
      filters.minHolders ? `holders ≥ ${filters.minHolders}` : "",
      filters.maxTop10Pct !== undefined ? `top-10 share ≤ ${filters.maxTop10Pct}%` : "",
      filters.minMarketCapUsd !== undefined || filters.maxMarketCapUsd !== undefined ? `market cap ${filters.minMarketCapUsd !== undefined ? `≥ ${fmtUsd(filters.minMarketCapUsd)}` : ""}${filters.maxMarketCapUsd !== undefined ? ` ≤ ${fmtUsd(filters.maxMarketCapUsd)}` : ""}` : "",
      filters.launchpad !== "any" ? `launchpad: ${filters.launchpad}${filters.launchpadName ? ` (${filters.launchpadName})` : ""}` : filters.launchpadName ? `launchpad ${filters.launchpadName}` : "",
      filters.excludeScams ? "potential scams excluded" : "scams included",
    ].filter(Boolean);
    const lines = [`Token screen on ${info.name} (Codex), ranked by ${rankBy}, ${criteria.join(", ")}: ${rows.length} results.`, COLUMNS.join(" | "), ...table.map((t) => t.join(" | "))];
    for (const m of rows) lines.push(`${m.symbol ?? "?"}: ${m.address}${m.exchanges.length ? ` · ${m.exchanges.slice(0, 3).join(", ")}` : ""}${m.buyCount24 !== undefined ? ` · 24h buys/sells ${m.buyCount24}/${m.sellCount24 ?? 0} by ${m.uniqueBuys24 ?? 0}/${m.uniqueSells24 ?? 0} wallets` : ""}${m.athPriceUsd ? ` · ATH ${fmtUsd(m.athPriceUsd)}${m.athAt ? ` ${ago(m.athAt)}` : ""}` : ""}${m.walletAgeAvgDays !== undefined ? ` · avg holder wallet age ${m.walletAgeAvgDays.toFixed(0)}d` : ""}`);
    if (!rows.length) lines.push("Nothing matched. Loosen a filter (liquidity, age, holders) or change the ranking.");
    return {
      data: { chain: info.id, count: rows.length, columns: COLUMNS, table, tokens: rows },
      summary: rows.length ? `${rows.length} tokens on ${info.name} match; top by ${rankBy}: ${rows.slice(0, 3).map((m) => m.symbol ?? m.address.slice(0, 6)).join(", ")}` : `No tokens on ${info.name} match the screen`,
      evidence: [{ kind: "table", label: `Token screen (${info.name})`, text: lines.join("\n").slice(0, 6_000), provider: "Codex" }],
    };
  },
};
