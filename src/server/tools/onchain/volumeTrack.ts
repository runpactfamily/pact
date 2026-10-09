import { PactError } from "../../errors";
import { ago, fmtNum, fmtPct, fmtUsd } from "../../onchain/format";
import { tokenPairs, type DexPair } from "../../onchain/sources/dexscreener";
import { tokenInfo } from "../../onchain/sources/geckoterminal";
import type { Tool } from "../types";
import { CHAIN_PROPERTY, evidence, requireChain, resolveToken, sourceOptions, tokenLink } from "./shared";

interface Input {
  chain: string;
  token: string;
}

type Window = "m5" | "h1" | "h6" | "h24";
const WINDOWS: Window[] = ["m5", "h1", "h6", "h24"];
const LABEL: Record<Window, string> = { m5: "5m", h1: "1h", h6: "6h", h24: "24h" };

interface Output {
  chain: string;
  address: string;
  symbol?: string;
  priceUsd?: number;
  liquidityUsd: number;
  pairs: number;
  volume: Record<Window, number>;
  priceChange: Partial<Record<Window, number>>;
  buys: Record<Window, number>;
  sells: Record<Window, number>;
  volumeToLiquidity24h?: number;
  acceleration?: number;
}

function sum(pairs: DexPair[], pick: (p: DexPair) => number | undefined): number {
  return pairs.reduce((s, p) => s + (pick(p) ?? 0), 0);
}

export const volumeTrackTool: Tool<Input, Output> = {
  name: "volume_track",
  description: "Volume, price change and buy/sell pressure for a token over 5m, 1h, 6h and 24h windows across all its pairs, with liquidity context.",
  stage: "analyzing",
  inputSchema: { type: "object", properties: { chain: CHAIN_PROPERTY, token: { type: "string", description: "Symbol or contract/mint address" } }, required: ["chain", "token"] },
  outputSchema: { type: "object", properties: { volume: { type: "object" }, priceChange: { type: "object" } } },
  isAvailable: () => ({ available: true }),
  async execute(input, context) {
    const { info, clients } = requireChain(input.chain);
    if (!info.dexscreener) throw new PactError("PROVIDER_UNAVAILABLE", `Volume tracking is not available on ${info.name} yet: no DEX indexer covers it.`);
    const options = sourceOptions(context);
    const resolved = await resolveToken(info, clients, input.token, options);
    const { address } = resolved;
    const pairs = resolved.resolvedVia === "dexscreener" && resolved.pairs.length ? resolved.pairs.filter((p) => p.baseToken.address.toLowerCase() === address.toLowerCase()) : await tokenPairs(info.dexscreener, [address], options);
    if (!pairs.length) throw new PactError("NOT_FOUND", `No DEX pairs are indexed for ${address} on ${info.name}.`);

    const main = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    const volume = Object.fromEntries(WINDOWS.map((w) => [w, sum(pairs, (p) => p.volume?.[w])])) as Record<Window, number>;
    const buys = Object.fromEntries(WINDOWS.map((w) => [w, sum(pairs, (p) => p.txns?.[w]?.buys)])) as Record<Window, number>;
    const sells = Object.fromEntries(WINDOWS.map((w) => [w, sum(pairs, (p) => p.txns?.[w]?.sells)])) as Record<Window, number>;
    const priceChange = Object.fromEntries(WINDOWS.map((w) => [w, main.priceChange?.[w]])) as Partial<Record<Window, number>>;
    const liquidityUsd = sum(pairs, (p) => p.liquidity?.usd);
    const out: Output = {
      chain: info.id,
      address,
      symbol: main.baseToken.symbol,
      priceUsd: Number(main.priceUsd ?? NaN) || undefined,
      liquidityUsd,
      pairs: pairs.length,
      volume,
      priceChange,
      buys,
      sells,
      volumeToLiquidity24h: liquidityUsd > 0 ? Number((volume.h24 / liquidityUsd).toFixed(2)) : undefined,
      // 1h volume annualised to 24h versus actual 24h: >1 means the last hour is running hotter than the day average.
      acceleration: volume.h24 > 0 ? Number(((volume.h1 * 24) / volume.h24).toFixed(2)) : undefined,
    };

    const lines = [
      `${main.baseToken.name} (${main.baseToken.symbol}) on ${info.name}, ${pairs.length} ${pairs.length === 1 ? "pair" : "pairs"}, price ${fmtUsd(main.priceUsd)}, liquidity ${fmtUsd(liquidityUsd)}`,
      ...WINDOWS.map((w) => `${LABEL[w]}: volume ${fmtUsd(volume[w])} · price ${fmtPct(priceChange[w])} · buys ${fmtNum(buys[w])} / sells ${fmtNum(sells[w])}${buys[w] + sells[w] > 0 ? ` (${((buys[w] / (buys[w] + sells[w])) * 100).toFixed(0)}% buys)` : ""}`),
      `24h volume / liquidity = ${out.volumeToLiquidity24h ?? "n/a"} · last-hour pace vs 24h average = ${out.acceleration ?? "n/a"}x`,
      `Main pair ${main.baseToken.symbol}/${main.quoteToken.symbol} on ${main.dexId}, created ${main.pairCreatedAt ? ago(main.pairCreatedAt) : "?"} (${main.url})`,
    ];
    if (pairs.length > 1) lines.push(`Other pairs: ${pairs.filter((p) => p !== main).slice(0, 4).map((p) => `${p.quoteToken.symbol} on ${p.dexId} (${fmtUsd(p.volume?.h24)} 24h)`).join(", ")}`);

    if (info.geckoterminal) {
      try {
        const gt = await tokenInfo(info.geckoterminal, address, options);
        if (gt) lines.push(`GeckoTerminal cross-check: 24h volume ${fmtUsd(gt.attributes.volume_usd?.h24)} · reserves ${fmtUsd(gt.attributes.total_reserve_in_usd)} · market cap ${fmtUsd(gt.attributes.market_cap_usd)} · FDV ${fmtUsd(gt.attributes.fdv_usd)}`);
      } catch {
        // Cross-check only.
      }
    }

    return {
      data: out,
      summary: `${main.baseToken.symbol}: 24h volume ${fmtUsd(volume.h24)} (${fmtPct(priceChange.h24)}), 1h ${fmtUsd(volume.h1)} (${fmtPct(priceChange.h1)}), ${buys.h24 + sells.h24 > 0 ? `${((buys.h24 / (buys.h24 + sells.h24)) * 100).toFixed(0)}% buys` : "no trades"}`,
      evidence: [evidence(info, `${main.baseToken.symbol} volume`, lines.join("\n"), "DexScreener", tokenLink(info, address))],
    };
  },
};
