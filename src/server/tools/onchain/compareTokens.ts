import { PactError } from "../../errors";
import { ago, fmtNum, fmtPct, fmtUsd } from "../../onchain/format";
import { bestPair, tokenPairs, type DexPair } from "../../onchain/sources/dexscreener";
import { evmRiskFlags, evmTokenSecurityMany, solanaRiskFlags, solanaTokenSecurity } from "../../onchain/sources/goplus";
import type { Tool } from "../types";
import { CHAIN_PROPERTY, evidence, isAddressFor, requireChain, resolveToken, sourceOptions } from "./shared";

interface Input {
  chain: string;
  tokens: string[];
}

interface Row {
  token: string;
  address?: string;
  symbol?: string;
  priceUsd?: number;
  change24h?: number;
  marketCap?: number;
  fdv?: number;
  liquidityUsd?: number;
  volume24h?: number;
  pairs?: number;
  ageDays?: number;
  buyShare24h?: number;
  severe?: number;
  warnings?: number;
  flags?: string[];
  error?: string;
}

const COLUMNS = ["Token", "Price", "24h", "Market cap", "Liquidity", "Vol 24h", "Vol/Liq", "Buys 24h", "Age", "Risk"];

export const compareTokensTool: Tool<Input, { chain: string; rows: Row[]; columns: string[]; table: string[][] }> = {
  name: "compare_tokens",
  description: "Side-by-side comparison of 2–6 tokens on one chain: price, 24h change, market cap, liquidity, volume, buy share, age and a risk screen, in one table.",
  stage: "analyzing",
  inputSchema: {
    type: "object",
    properties: { chain: CHAIN_PROPERTY, tokens: { type: "array", items: { type: "string" }, description: "2–6 symbols or addresses" } },
    required: ["chain", "tokens"],
  },
  outputSchema: { type: "object", properties: { rows: { type: "array", items: { type: "object" } }, table: { type: "array", items: { type: "array" } } } },
  isAvailable: () => ({ available: true }),
  async execute(input, context) {
    const { info, clients } = requireChain(input.chain);
    if (!info.dexscreener) throw new PactError("PROVIDER_UNAVAILABLE", `Token comparison is not available on ${info.name} yet: no market indexer covers it.`);
    const options = sourceOptions(context);
    const wanted = [...new Set((input.tokens ?? []).map((t) => String(t).trim()).filter(Boolean))].slice(0, 6);
    if (wanted.length < 2) throw new PactError("INVALID_REQUEST", "Name at least two tokens to compare.");

    // Resolve symbols (one request each), then fetch every token's pairs in one request.
    const rows: Row[] = [];
    for (const token of wanted) {
      const clean = token.replace(/^\$+/, "");
      if (isAddressFor(info, clean)) {
        rows.push({ token, address: clean });
        continue;
      }
      try {
        const r = await resolveToken(info, clients, clean, options);
        rows.push({ token, address: r.address, symbol: r.symbol });
      } catch (error) {
        rows.push({ token, error: (error as Error).message });
      }
    }
    const addresses = rows.map((r) => r.address).filter((a): a is string => Boolean(a));
    const pairs = addresses.length ? await tokenPairs(info.dexscreener, addresses, options) : [];
    const flags = new Map<string, { severe: string[]; warnings: string[] }>();
    if (info.goplus && addresses.length) {
      try {
        if (info.family === "evm") for (const [a, r] of Object.entries(await evmTokenSecurityMany(info.goplus, addresses, options))) flags.set(a.toLowerCase(), evmRiskFlags(r));
        else for (const [a, r] of Object.entries(await solanaTokenSecurity(addresses, options))) flags.set(a, solanaRiskFlags(r));
      } catch {
        // The screen is a bonus; the comparison stands without it.
      }
    }

    const now = Date.now();
    for (const row of rows) {
      if (!row.address) continue;
      const mine = pairs.filter((p: DexPair) => p.baseToken.address.toLowerCase() === row.address!.toLowerCase());
      const main = bestPair(mine, row.address);
      if (!main) {
        row.error = "no DEX pair indexed";
        continue;
      }
      row.symbol = main.baseToken.symbol;
      row.priceUsd = Number(main.priceUsd ?? NaN) || undefined;
      row.change24h = main.priceChange?.h24;
      row.marketCap = main.marketCap;
      row.fdv = main.fdv;
      row.liquidityUsd = mine.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0);
      row.volume24h = mine.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0);
      row.pairs = mine.length;
      const created = mine.map((p) => p.pairCreatedAt ?? 0).filter(Boolean);
      row.ageDays = created.length ? Math.floor((now - Math.min(...created)) / 86_400_000) : undefined;
      const buys = mine.reduce((s, p) => s + (p.txns?.h24?.buys ?? 0), 0);
      const sells = mine.reduce((s, p) => s + (p.txns?.h24?.sells ?? 0), 0);
      row.buyShare24h = buys + sells > 0 ? (buys / (buys + sells)) * 100 : undefined;
      const f = flags.get(info.family === "evm" ? row.address.toLowerCase() : row.address);
      if (f) {
        row.severe = f.severe.length;
        row.warnings = f.warnings.length;
        row.flags = [...f.severe.map((x) => `SEVERE: ${x}`), ...f.warnings].slice(0, 4);
      }
    }

    const table = rows.map((r) => [
      r.symbol ?? r.token,
      r.error ? r.error : fmtUsd(r.priceUsd),
      fmtPct(r.change24h),
      fmtUsd(r.marketCap),
      fmtUsd(r.liquidityUsd),
      fmtUsd(r.volume24h),
      r.liquidityUsd && r.volume24h !== undefined ? (r.volume24h / r.liquidityUsd).toFixed(2) : "n/a",
      r.buyShare24h !== undefined ? `${r.buyShare24h.toFixed(0)}%` : "n/a",
      r.ageDays !== undefined ? `${r.ageDays}d` : "n/a",
      r.severe === undefined ? "not screened" : r.severe ? `${r.severe} SEVERE` : `${r.warnings ?? 0} warnings`,
    ]);
    const lines = [`Comparison on ${info.name} (DexScreener${flags.size ? " + GoPlus" : ""}):`, COLUMNS.join(" | "), ...table.map((t) => t.join(" | "))];
    for (const r of rows) if (r.address) lines.push(`${r.symbol ?? r.token}: ${r.address}${r.pairs ? ` · ${r.pairs} pairs` : ""}${r.ageDays !== undefined ? ` · first pair ${ago(now - r.ageDays * 86_400_000)}` : ""}${r.flags?.length ? ` · risk notes: ${r.flags.join("; ")}` : r.severe === undefined ? " · not screened by GoPlus" : " · no flags from the checks run"}`);

    const ranked = rows.filter((r) => r.volume24h !== undefined).sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
    return {
      data: { chain: info.id, rows, columns: COLUMNS, table },
      summary: ranked.length ? `${ranked.length} of ${rows.length} tokens compared; most traded ${ranked[0].symbol} (${fmtUsd(ranked[0].volume24h)} 24h), most liquid ${[...ranked].sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))[0].symbol}` : `None of the ${rows.length} tokens could be compared`,
      evidence: [{ kind: "table", label: `Token comparison (${info.name})`, text: lines.join("\n").slice(0, 6_000), provider: flags.size ? "DexScreener + GoPlus" : "DexScreener" }],
    };
    void fmtNum;
  },
};
