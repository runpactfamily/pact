import { PactError } from "../../errors";
import { fmtPct, fmtUsd } from "../../onchain/format";
import { chains as llamaChains, chainTvlHistory, protocolsOnChain, stablecoinsOnChain, yieldsOnChain } from "../../onchain/sources/defillama";
import type { Tool } from "../types";
import { CHAIN_PROPERTY, evidence, requireChain, sourceOptions } from "./shared";

interface Input {
  chain: string;
  focus?: "protocols" | "yields";
  limit?: number;
  minTvlUsd?: number;
  stablecoinOnly?: boolean;
}

interface Output {
  chain: string;
  focus: string;
  tvlUsd?: number;
  tvlChange7dPct?: number;
  tvlChange30dPct?: number;
  stablecoinsUsd?: number;
  protocols?: { name: string; category?: string; tvlUsd: number; change7dPct?: number | null }[];
  yields?: { project: string; symbol: string; apyPct: number; tvlUsd: number; stablecoin?: boolean }[];
}

export const defiOverviewTool: Tool<Input, Output> = {
  name: "defi_overview",
  description: "DeFi on a chain: TVL with 7d and 30d change, stablecoin supply, and either the largest protocols by TVL (focus=protocols) or the best yields above a TVL floor (focus=yields).",
  stage: "researching",
  inputSchema: {
    type: "object",
    properties: {
      chain: CHAIN_PROPERTY,
      focus: { type: "string", enum: ["protocols", "yields"], description: "default protocols" },
      limit: { type: "number", description: "entries, 1–20 (default 10)" },
      minTvlUsd: { type: "number", description: "yields: minimum pool TVL (default 1000000)" },
      stablecoinOnly: { type: "boolean", description: "yields: only stablecoin pools" },
    },
    required: ["chain"],
  },
  outputSchema: { type: "object", properties: { tvlUsd: { type: "number" }, protocols: { type: "array", items: { type: "object" } }, yields: { type: "array", items: { type: "object" } } } },
  isAvailable: () => ({ available: true }),
  async execute(input, context) {
    const { info } = requireChain(input.chain);
    const options = sourceOptions(context);
    const focus = input.focus === "yields" ? "yields" : "protocols";
    const limit = Math.min(20, Math.max(1, Math.floor(input.limit ?? 10)));
    const minTvl = Math.max(0, input.minTvlUsd ?? 1_000_000);

    // DefiLlama's own name for the chain: configured, else found by chain id in its list.
    let chainName = info.defillamaChainName;
    const list = await llamaChains(options);
    const row = list.find((c) => (info.chainId && c.chainId === info.chainId) || (chainName && c.name.toLowerCase() === chainName.toLowerCase()) || c.name.toLowerCase().includes(info.id));
    chainName ??= row?.name;
    if (!chainName) throw new PactError("NOT_FOUND", `DefiLlama does not track ${info.name} yet.`);

    const [history, stables, detail] = await Promise.all([
      chainTvlHistory(chainName, options).catch(() => []),
      stablecoinsOnChain(chainName, options).catch(() => null),
      focus === "protocols" ? protocolsOnChain(chainName, limit, options) : yieldsOnChain(chainName, minTvl, input.stablecoinOnly ? limit * 8 : limit, options).then((rows) => (input.stablecoinOnly ? rows.filter((y) => y.stablecoin).slice(0, limit) : rows)),
    ]);

    const out: Output = { chain: info.id, focus, tvlUsd: row?.tvl, stablecoinsUsd: stables?.totalUsd };
    const lines: string[] = [];
    const latest = history[history.length - 1];
    const at = (daysBack: number) => history[history.length - 1 - daysBack];
    if (latest) {
      out.tvlUsd = latest.tvl;
      const d7 = at(7);
      const d30 = at(30);
      out.tvlChange7dPct = d7 ? ((latest.tvl - d7.tvl) / d7.tvl) * 100 : undefined;
      out.tvlChange30dPct = d30 ? ((latest.tvl - d30.tvl) / d30.tvl) * 100 : undefined;
      lines.push(`${info.name} DeFi TVL ${fmtUsd(latest.tvl)} · 7d ${fmtPct(out.tvlChange7dPct)} · 30d ${fmtPct(out.tvlChange30dPct)} (DefiLlama, ${history.length} days of history)`);
    } else if (row) {
      lines.push(`${info.name} DeFi TVL ${fmtUsd(row.tvl)} (DefiLlama)`);
    }
    if (stables) {
      const pegs = Object.entries(stables.byPeg).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([peg, usd]) => `${peg.replace("pegged", "")} ${fmtUsd(usd)}`);
      lines.push(`Stablecoins circulating on ${info.name}: ${fmtUsd(stables.totalUsd)}${pegs.length ? ` (${pegs.join(", ")})` : ""}`);
    }

    if (focus === "protocols") {
      const protocols = detail as Awaited<ReturnType<typeof protocolsOnChain>>;
      out.protocols = protocols.map((p) => ({ name: p.name, category: p.category, tvlUsd: p.tvlOnChain, change7dPct: p.change_7d }));
      if (protocols.length) {
        lines.push(`Largest protocols by TVL on ${info.name}:`);
        protocols.forEach((p, i) => lines.push(`${i + 1}. ${p.name} (${p.category ?? "?"}) · TVL ${fmtUsd(p.tvlOnChain)} · 7d ${fmtPct(p.change_7d)}${p.url ? ` · ${p.url}` : ""}`));
        const top3 = protocols.slice(0, 3).reduce((s, p) => s + p.tvlOnChain, 0);
        // Curators and vaults deposit into other protocols, so protocol TVLs can add up to more than the chain's.
        if (out.tvlUsd && top3 <= out.tvlUsd) lines.push(`Top 3 protocols hold ${((top3 / out.tvlUsd) * 100).toFixed(0)}% of chain TVL.`);
        else if (out.tvlUsd) lines.push("Protocol TVLs overlap (vaults and curators deposit into lending markets), so they add up to more than the chain total.");
      } else {
        lines.push(`DefiLlama lists no protocols with TVL on ${info.name}.`);
      }
    } else {
      const yields = detail as Awaited<ReturnType<typeof yieldsOnChain>>;
      out.yields = yields.map((y) => ({ project: y.project, symbol: y.symbol, apyPct: y.apy ?? 0, tvlUsd: y.tvlUsd, stablecoin: y.stablecoin }));
      if (yields.length) {
        lines.push(`Best ${input.stablecoinOnly ? "stablecoin " : ""}yields on ${info.name} with at least ${fmtUsd(minTvl)} TVL (DefiLlama; APY includes rewards where listed; very high APYs on volatile pairs usually come with impermanent loss):`);
        yields.forEach((y, i) => lines.push(`${i + 1}. ${y.project} · ${y.symbol} · APY ${(y.apy ?? 0).toFixed(2)}%${y.apyReward ? ` (base ${(y.apyBase ?? 0).toFixed(2)}% + rewards ${y.apyReward.toFixed(2)}%)` : ""} · TVL ${fmtUsd(y.tvlUsd)} · ${y.stablecoin ? "stablecoin" : "volatile"}${y.ilRisk === "yes" ? " · impermanent loss risk" : ""}`));
      } else {
        lines.push(`No yield pools above ${fmtUsd(minTvl)} TVL are listed for ${info.name}.`);
      }
    }

    return {
      data: out,
      summary: `${info.name}: TVL ${fmtUsd(out.tvlUsd)} (${fmtPct(out.tvlChange7dPct)} 7d), stablecoins ${fmtUsd(out.stablecoinsUsd)}, ${focus === "protocols" ? `${out.protocols?.length ?? 0} protocols listed` : `${out.yields?.length ?? 0} yields listed`}`,
      evidence: [evidence(info, `DeFi ${focus}`, lines.join("\n"), "DefiLlama")],
    };
  },
};
