import { ago, fmtNum, fmtPct, fmtUsd } from "../../onchain/format";
import { chains as llamaChains, dexOverview } from "../../onchain/sources/defillama";
import { topBoosts } from "../../onchain/sources/dexscreener";
import { poolBaseToken, topPools, trendingPools } from "../../onchain/sources/geckoterminal";
import type { Tool } from "../types";
import { CHAIN_PROPERTY, evidence, requireChain, sourceOptions } from "./shared";

interface Input {
  chain: string;
  limit?: number;
}

interface Output {
  chain: string;
  tvlUsd?: number;
  dexVolume24h?: number;
  dexVolumeChange1d?: number;
  nativePriceUsd?: number;
  gasGwei?: number;
  block?: number;
  topVolume?: { name: string; token?: string; volume24h?: number; liquidityUsd?: number; change24h?: number }[];
  promoted?: { token: string; url: string; boosts?: number }[];
  trending: { name: string; token?: string; priceUsd?: number; change24h?: number; volume24h?: number; liquidityUsd?: number; ageHours?: number }[];
}

export const marketOverviewTool: Tool<Input, Output> = {
  name: "market_overview",
  description: "What is moving on a chain right now: trending pools by activity, chain TVL, DEX volume and its 24h change.",
  stage: "researching",
  inputSchema: { type: "object", properties: { chain: CHAIN_PROPERTY, limit: { type: "number", description: "trending entries, 1–20 (default 10)" } }, required: ["chain"] },
  outputSchema: { type: "object", properties: { tvlUsd: { type: "number" }, trending: { type: "array", items: { type: "object" } } } },
  isAvailable: () => ({ available: true }),
  async execute(input, context) {
    const { info, clients } = requireChain(input.chain);
    const options = sourceOptions(context);
    const limit = Math.min(20, Math.max(1, Math.floor(input.limit ?? 10)));
    const out: Output = { chain: info.id, trending: [] };
    const lines: string[] = [];
    const providers: string[] = [];

    const [chainsResult, dexResult] = await Promise.allSettled([llamaChains(options), info.defillama ? dexOverview(info.defillama, options) : Promise.resolve(null)]);
    if (chainsResult.status === "fulfilled") {
      const row = chainsResult.value.find((c) => (info.chainId && c.chainId === info.chainId) || c.name.toLowerCase() === (info.defillamaChainName ?? info.name).toLowerCase() || c.name.toLowerCase().includes(info.id));
      if (row) {
        providers.push("DefiLlama");
        out.tvlUsd = row.tvl;
        lines.push(`${info.name} TVL (DeFi): ${fmtUsd(row.tvl)}`);
      } else {
        lines.push(`DefiLlama does not track TVL for ${info.name} yet.`);
      }
    }
    if (dexResult.status === "fulfilled" && dexResult.value) {
      const d = dexResult.value;
      out.dexVolume24h = d.total24h;
      out.dexVolumeChange1d = d.change_1d;
      const top = (d.protocols ?? []).sort((a, b) => (b.total24h ?? 0) - (a.total24h ?? 0)).slice(0, 5);
      lines.push(`DEX volume 24h ${fmtUsd(d.total24h)} (${fmtPct(d.change_1d)} vs previous day) · 7d ${fmtUsd(d.total7d)}${top.length ? ` · top DEXes: ${top.map((p) => `${p.name} ${fmtUsd(p.total24h)}`).join(", ")}` : ""}`);
    }

    // Global context from CoinGecko, so a chain's day can be read against the whole market. One request.
    if (clients.coingecko) {
      const g = await clients.coingecko.global(options).catch(() => null);
      if (g) {
        providers.push("CoinGecko");
        lines.push(`Whole market: total cap ${fmtUsd(g.totalMarketCapUsd)} (${fmtPct(g.change24hPct)} 24h) · BTC dominance ${g.btcDominancePct?.toFixed(1) ?? "n/a"}% · ETH ${g.ethDominancePct?.toFixed(1) ?? "n/a"}%`);
      }
    }

    // Network snapshot straight from the chain.
    if (clients.evm) {
      const net = await clients.evm.network(options).catch(() => null);
      if (net) {
        out.gasGwei = net.gasGwei;
        out.block = net.block;
        lines.push(`Network: block ${net.block.toLocaleString("en-US")} · gas ${net.gasGwei < 0.01 ? net.gasGwei.toPrecision(2) : net.gasGwei.toFixed(2)} gwei`);
      }
    }

    if (info.geckoterminal) {
      const [pools, top, boosts] = await Promise.all([trendingPools(info.geckoterminal, options), topPools(info.geckoterminal, options).catch(() => []), info.dexscreener ? topBoosts(options).catch(() => []) : Promise.resolve([])]);
      providers.push("GeckoTerminal");
      if (top.length) {
        out.topVolume = top.slice(0, Math.min(limit, 8)).map((p) => ({ name: p.attributes.name, token: poolBaseToken(p), volume24h: p.attributes.volume_usd?.h24 ? Number(p.attributes.volume_usd.h24) : undefined, liquidityUsd: p.attributes.reserve_in_usd ? Number(p.attributes.reserve_in_usd) : undefined, change24h: p.attributes.price_change_percentage?.h24 ? Number(p.attributes.price_change_percentage.h24) : undefined }));
        lines.push(`Top pools by 24h volume: ${out.topVolume.map((p) => `${p.name} ${fmtUsd(p.volume24h)} (${fmtPct(p.change24h)})`).join(" · ")}`);
      }
      const mine = boosts.filter((b) => b.chainId === info.dexscreener).slice(0, 8);
      if (mine.length) {
        providers.push("DexScreener");
        out.promoted = mine.map((b) => ({ token: b.tokenAddress, url: b.url, boosts: b.totalAmount ?? b.amount }));
        lines.push(`Tokens currently paying for promotion on DexScreener (${info.name}, a hype signal, not quality): ${mine.map((b) => `${b.tokenAddress.slice(0, 8)}… (${b.totalAmount ?? b.amount ?? "?"} boosts)`).join(", ")}`);
      }
      const rows = pools.slice(0, limit).map((p) => {
        const a = p.attributes;
        const created = a.pool_created_at ? Date.parse(a.pool_created_at) : undefined;
        return {
          name: a.name,
          token: poolBaseToken(p),
          priceUsd: a.base_token_price_usd ? Number(a.base_token_price_usd) : undefined,
          change24h: a.price_change_percentage?.h24 ? Number(a.price_change_percentage.h24) : undefined,
          volume24h: a.volume_usd?.h24 ? Number(a.volume_usd.h24) : undefined,
          liquidityUsd: a.reserve_in_usd ? Number(a.reserve_in_usd) : undefined,
          ageHours: created ? Math.floor((Date.now() - created) / 3_600_000) : undefined,
          buys: a.transactions?.h24?.buys,
          sells: a.transactions?.h24?.sells,
          createdAt: created,
        };
      });
      out.trending = rows.map(({ buys: _b, sells: _s, createdAt: _c, ...r }) => r);
      lines.push(`Trending pools on ${info.name} (GeckoTerminal, by activity):`);
      rows.forEach((r, i) => {
        lines.push(`${i + 1}. ${r.name} · price ${fmtUsd(r.priceUsd)} · 24h ${fmtPct(r.change24h)} · vol 24h ${fmtUsd(r.volume24h)} · liquidity ${fmtUsd(r.liquidityUsd)} · buys/sells ${r.buys ?? "?"}/${r.sells ?? "?"} · pool age ${r.createdAt ? ago(r.createdAt) : "?"}${r.token ? ` · token ${r.token}` : ""}`);
      });
    } else if (clients.codex && clients.codexNetwork) {
      const rows = await clients.codex.screen(clients.codexNetwork, { minLiquidityUsd: 1_000, excludeScams: true }, "trending", limit, options).catch(() => []);
      if (rows.length) {
        providers.push("Codex");
        out.trending = rows.map((m) => ({ name: `${m.symbol ?? "?"}${m.exchanges[0] ? ` on ${m.exchanges[0]}` : ""}`, token: m.address, priceUsd: m.priceUsd, change24h: m.change24, volume24h: m.volume24, liquidityUsd: m.liquidityUsd, ageHours: m.createdAt ? Math.floor((Date.now() - m.createdAt) / 3_600_000) : undefined }));
        lines.push(`Trending tokens on ${info.name} (Codex, by trending score):`);
        rows.forEach((m, i) => lines.push(`${i + 1}. ${m.symbol ?? "?"} (${m.name ?? "?"}) · price ${fmtUsd(m.priceUsd)} · 24h ${fmtPct(m.change24)} · vol 24h ${fmtUsd(m.volume24)} · liquidity ${fmtUsd(m.liquidityUsd)} · holders ${m.holders !== undefined ? fmtNum(m.holders) : "n/a"} · age ${m.createdAt ? ago(m.createdAt) : "?"} · ${m.address}`));
      }
      if (clients.explorer?.nativePriceUsd) {
        const price = await clients.explorer.nativePriceUsd(options).catch(() => undefined);
        if (price) {
          out.nativePriceUsd = price;
          lines.push(`${info.nativeSymbol} price on ${info.name}: ${fmtUsd(price)} (explorer quote).`);
        }
      }
    } else {
      // No market indexer: say what the chain itself can tell.
      if (clients.explorer?.nativePriceUsd) {
        const price = await clients.explorer.nativePriceUsd(options).catch(() => undefined);
        if (price) {
          providers.push(clients.explorer.vendor);
          out.nativePriceUsd = price;
          lines.push(`${info.nativeSymbol} price on ${info.name}: ${fmtUsd(price)} (explorer quote).`);
        }
      }
      lines.push(`No trending or DEX volume data: market indexers (DexScreener, GeckoTerminal, DefiLlama) do not cover ${info.name} yet. Individual tokens and wallets can still be inspected by address.`);
    }

    return {
      data: out,
      summary: out.trending.length ? `${info.name}: ${out.trending.length} trending entries${out.dexVolume24h !== undefined ? `, DEX volume ${fmtUsd(out.dexVolume24h)} (${fmtPct(out.dexVolumeChange1d)})` : ""}` : `${info.name}: no market indexer covers this chain yet${out.nativePriceUsd ? `; ${info.nativeSymbol} ${fmtUsd(out.nativePriceUsd)}` : ""}`,
      evidence: [evidence(info, "Market overview", lines.join("\n"), providers.join(" + ") || "chain")],
    };
  },
};
