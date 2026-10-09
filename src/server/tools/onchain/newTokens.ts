import { PactError } from "../../errors";
import { ago, fmtPct, fmtUsd } from "../../onchain/format";
import { newPools, poolBaseToken } from "../../onchain/sources/geckoterminal";
import { evmRiskFlags, evmTokenSecurityMany, solanaRiskFlags, solanaTokenSecurity } from "../../onchain/sources/goplus";
import type { Tool } from "../types";
import { CHAIN_PROPERTY, evidence, requireChain, sourceOptions } from "./shared";

interface Input {
  chain: string;
  maxAgeHours?: number;
  minLiquidityUsd?: number;
  limit?: number;
}

interface Output {
  chain: string;
  scanned: number;
  tokens: { name: string; token?: string; ageHours?: number; liquidityUsd?: number; volume24h?: number; change1h?: number; buys?: number; sells?: number; severe?: string[]; warnings?: number }[];
}

export const newTokensTool: Tool<Input, Output> = {
  name: "new_tokens",
  description: "Recently created pools/tokens on a chain with age, liquidity, early volume and a quick risk screen. Filters by max age and minimum liquidity.",
  stage: "researching",
  inputSchema: {
    type: "object",
    properties: {
      chain: CHAIN_PROPERTY,
      maxAgeHours: { type: "number", description: "only pools younger than this (default 24)" },
      minLiquidityUsd: { type: "number", description: "skip pools with less liquidity (default 5000)" },
      limit: { type: "number", description: "1–15 (default 10)" },
    },
    required: ["chain"],
  },
  outputSchema: { type: "object", properties: { scanned: { type: "number" }, tokens: { type: "array", items: { type: "object" } } } },
  isAvailable: () => ({ available: true }),
  async execute(input, context) {
    const { info, clients } = requireChain(input.chain);
    const options = sourceOptions(context);
    const maxAge = Math.max(1, input.maxAgeHours ?? 24);
    const minLiq = Math.max(0, input.minLiquidityUsd ?? 5_000);
    const limit = Math.min(15, Math.max(1, Math.floor(input.limit ?? 10)));

    // Codex: new tokens with holder composition, launchpad stage and scam flags, on every chain. One request.
    if (clients.codex && clients.codexNetwork) {
      const rows = await clients.codex.screen(clients.codexNetwork, { minLiquidityUsd: minLiq, maxAgeHours: maxAge, excludeScams: true }, "volume24", limit, options).catch(() => null);
      if (rows) {
        const now = Date.now();
        const lines = [`New tokens on ${info.name} (Codex), created within ${maxAge}h with at least ${fmtUsd(minLiq)} liquidity, potential scams excluded, ranked by 24h volume: ${rows.length} results.`, "Token | Price | 1h | Liquidity | Vol 24h | Holders | Top10 | Age | Snipers | Insiders | Dev | Launchpad | Buys/Sells 24h", ...rows.map((m) => [m.symbol ?? m.address.slice(0, 8), fmtUsd(m.priceUsd), fmtPct(m.change1), fmtUsd(m.liquidityUsd), fmtUsd(m.volume24), m.holders !== undefined ? String(m.holders) : "n/a", m.top10HoldersPct !== undefined ? `${m.top10HoldersPct.toFixed(0)}%` : "n/a", m.createdAt ? ago(m.createdAt) : "n/a", m.sniperHeldPct !== null && m.sniperHeldPct !== undefined ? `${m.sniperHeldPct.toFixed(0)}%` : "n/a", m.insiderHeldPct !== null && m.insiderHeldPct !== undefined ? `${m.insiderHeldPct.toFixed(0)}%` : "n/a", m.devHeldPct !== null && m.devHeldPct !== undefined ? `${m.devHeldPct.toFixed(0)}%` : "n/a", m.launchpad?.name ? `${m.launchpad.name}${m.launchpad.completed ? " (graduated)" : m.launchpad.graduationPct !== null && m.launchpad.graduationPct !== undefined ? ` ${m.launchpad.graduationPct.toFixed(0)}%` : ""}` : "-", `${m.buyCount24 ?? "?"}/${m.sellCount24 ?? "?"}`].join(" | "))];
        for (const m of rows) lines.push(`${m.symbol ?? "?"}: ${m.address}${m.exchanges.length ? ` · ${m.exchanges.slice(0, 2).join(", ")}` : ""}`);
        if (!rows.length) lines.push("Nothing matched the filters.");
        const tokens = rows.map((m) => ({ name: m.symbol ?? m.address.slice(0, 8), token: m.address, ageHours: m.createdAt ? Math.round(((now - m.createdAt) / 3_600_000) * 10) / 10 : undefined, liquidityUsd: m.liquidityUsd, volume24h: m.volume24, change1h: m.change1, buys: m.buyCount24, sells: m.sellCount24, severe: m.isScam ? ["marked as scam"] : undefined, warnings: m.potentialScamReasons.length }));
        return {
          data: { chain: info.id, scanned: rows.length, tokens },
          summary: `${rows.length} new ${rows.length === 1 ? "token" : "tokens"} on ${info.name} matched (Codex, scams excluded)${rows.some((m) => m.launchpad?.name) ? `, ${rows.filter((m) => m.launchpad?.name).length} via launchpads` : ""}`,
          evidence: [{ kind: "table", label: `New tokens (${info.name})`, text: lines.join("\n").slice(0, 6_000), provider: "Codex" }],
        };
      }
    }
    if (!info.geckoterminal) throw new PactError("PROVIDER_UNAVAILABLE", `New-token discovery is not available on ${info.name} yet: no market indexer covers it.`);

    const pools = await newPools(info.geckoterminal, options);
    const now = Date.now();
    const candidates = pools
      .map((p) => {
        const a = p.attributes;
        const created = a.pool_created_at ? Date.parse(a.pool_created_at) : undefined;
        return {
          name: a.name,
          token: poolBaseToken(p),
          createdAt: created,
          ageHours: created ? (now - created) / 3_600_000 : undefined,
          liquidityUsd: a.reserve_in_usd ? Number(a.reserve_in_usd) : 0,
          volume24h: a.volume_usd?.h24 ? Number(a.volume_usd.h24) : 0,
          change1h: a.price_change_percentage?.h1 ? Number(a.price_change_percentage.h1) : undefined,
          buys: a.transactions?.h24?.buys,
          sells: a.transactions?.h24?.sells,
          priceUsd: a.base_token_price_usd ? Number(a.base_token_price_usd) : undefined,
        };
      })
      .filter((c) => (c.ageHours === undefined || c.ageHours <= maxAge) && c.liquidityUsd >= minLiq)
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, limit);

    // One security batch for the shortlist.
    const flagsByToken = new Map<string, { severe: string[]; warnings: string[] }>();
    const addresses = candidates.map((c) => c.token).filter((t): t is string => Boolean(t));
    if (addresses.length && info.goplus) {
      try {
        if (info.family === "evm") {
          const reports = await evmTokenSecurityMany(info.goplus, addresses, options);
          for (const [addr, r] of Object.entries(reports)) flagsByToken.set(addr.toLowerCase(), evmRiskFlags(r));
        } else {
          const reports = await solanaTokenSecurity(addresses, options);
          for (const [addr, r] of Object.entries(reports)) flagsByToken.set(addr, solanaRiskFlags(r));
        }
      } catch {
        // The screen is a bonus; the list still stands without it.
      }
    }

    const lines = [`New pools on ${info.name} (GeckoTerminal), younger than ${maxAge}h with at least ${fmtUsd(minLiq)} liquidity, ranked by 24h volume. ${pools.length} scanned, ${candidates.length} kept.`];
    const tokens = candidates.map((c, i) => {
      const flags = c.token ? flagsByToken.get(info.family === "evm" ? c.token.toLowerCase() : c.token) : undefined;
      const risk = flags ? (flags.severe.length ? `SEVERE: ${flags.severe.join("; ")}` : `${flags.warnings.length} warnings${flags.warnings.length ? ` (${flags.warnings.slice(0, 2).join("; ")})` : ""}`) : "not screened";
      lines.push(`${i + 1}. ${c.name} · age ${c.createdAt ? ago(c.createdAt) : "?"} · liquidity ${fmtUsd(c.liquidityUsd)} · vol 24h ${fmtUsd(c.volume24h)} · 1h ${fmtPct(c.change1h)} · buys/sells ${c.buys ?? "?"}/${c.sells ?? "?"} · price ${fmtUsd(c.priceUsd)} · token ${c.token ?? "?"} · risk: ${risk}`);
      return { name: c.name, token: c.token, ageHours: c.ageHours !== undefined ? Math.round(c.ageHours * 10) / 10 : undefined, liquidityUsd: c.liquidityUsd, volume24h: c.volume24h, change1h: c.change1h, buys: c.buys, sells: c.sells, severe: flags?.severe, warnings: flags?.warnings.length };
    });
    if (!tokens.length) lines.push("Nothing matched the filters in the latest batch of new pools.");

    return {
      data: { chain: info.id, scanned: pools.length, tokens },
      summary: `${tokens.length} new ${tokens.length === 1 ? "token" : "tokens"} on ${info.name} matched (of ${pools.length} new pools)${flagsByToken.size ? `, ${tokens.filter((t) => t.severe?.length).length} with severe flags` : ""}`,
      evidence: [evidence(info, "New tokens", lines.join("\n"), flagsByToken.size ? "GeckoTerminal + GoPlus" : "GeckoTerminal")],
    };
  },
};
