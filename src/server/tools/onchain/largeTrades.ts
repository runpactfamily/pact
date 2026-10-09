import { PactError } from "../../errors";
import { ago, fmtNum, fmtUsd, shortAddr } from "../../onchain/format";
import { tokenPairs } from "../../onchain/sources/dexscreener";
import { poolTrades, tokenPools } from "../../onchain/sources/geckoterminal";
import type { Tool } from "../types";
import { CHAIN_PROPERTY, evidence, requireChain, resolveToken, sourceOptions, tokenLink } from "./shared";

interface Input {
  chain: string;
  token: string;
  minUsd?: number;
  limit?: number;
}

interface Output {
  chain: string;
  address: string;
  symbol?: string;
  pool: string;
  minUsd: number;
  trades: number;
  buys: number;
  sells: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  netFlowUsd: number;
  uniqueTraders: number;
  largest: { kind: string; usd: number; trader: string; tx?: string; at?: number }[];
}

export const largeTradesTool: Tool<Input, Output> = {
  name: "large_trades",
  description: "Large trades in a token's main pool over the last 24 hours: buys vs sells above a USD size, net flow, biggest trades with the trading address and transaction.",
  stage: "analyzing",
  inputSchema: {
    type: "object",
    properties: {
      chain: CHAIN_PROPERTY,
      token: { type: "string", description: "Symbol or contract/mint address" },
      minUsd: { type: "number", description: "only trades above this size in USD (default 5000)" },
      limit: { type: "number", description: "largest trades to list, 1–20 (default 8)" },
    },
    required: ["chain", "token"],
  },
  outputSchema: { type: "object", properties: { trades: { type: "number" }, netFlowUsd: { type: "number" } } },
  isAvailable: () => ({ available: true }),
  async execute(input, context) {
    const { info, clients } = requireChain(input.chain);
    const codexReady = Boolean(clients.codex && clients.codexNetwork);
    if (!codexReady && (!info.geckoterminal || !info.dexscreener)) throw new PactError("PROVIDER_UNAVAILABLE", `Trade data is not available on ${info.name} yet: no market indexer covers it.`);
    const options = sourceOptions(context);
    const minUsd = Math.max(100, input.minUsd ?? 5_000);
    const limit = Math.min(20, Math.max(1, Math.floor(input.limit ?? 8)));
    const resolved = await resolveToken(info, clients, input.token, options);
    const { address } = resolved;

    // Codex: buy/sell events across every pool of the token, with sandwich and wash-trade labels.
    if (codexReady) {
      const events = await clients.codex!.events(clients.codexNetwork!, address, minUsd, Date.now() - 86_400_000, 200, options).catch(() => null);
      if (events) {
        const buys = events.filter((e) => e.kind === "Buy");
        const sells = events.filter((e) => e.kind === "Sell");
        const buyVolumeUsd = buys.reduce((s, e) => s + e.usd, 0);
        const sellVolumeUsd = sells.reduce((s, e) => s + e.usd, 0);
        const traders = new Map<string, number>();
        for (const e of events) traders.set(e.maker, (traders.get(e.maker) ?? 0) + (e.kind === "Buy" ? e.usd : -e.usd));
        const repeat = [...traders.entries()].filter(([, net]) => Math.abs(net) >= minUsd * 2).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5);
        const flagged = events.filter((e) => e.labels.length);
        const largest = [...events].sort((a, b) => b.usd - a.usd).slice(0, limit);
        // A bare address resolves to its symbol through Codex when no DEX search named it (one extra request).
        const symbol = resolved.symbol ?? (await clients.codex!.tokenMetrics(clients.codexNetwork!, [address], options).catch(() => []))[0]?.symbol ?? address;
        const out: Output = { chain: info.id, address, symbol: symbol === address ? undefined : symbol, pool: "all pools", minUsd, trades: events.length, buys: buys.length, sells: sells.length, buyVolumeUsd, sellVolumeUsd, netFlowUsd: buyVolumeUsd - sellVolumeUsd, uniqueTraders: traders.size, largest: largest.map((e) => ({ kind: e.kind.toLowerCase(), usd: e.usd, trader: e.maker, tx: e.tx, at: e.at })) };
        const lines = [`${symbol} on ${info.name}, all pools (Codex): ${events.length} trades above ${fmtUsd(minUsd)} in the last 24h · ${buys.length} buys (${fmtUsd(buyVolumeUsd)}) vs ${sells.length} sells (${fmtUsd(sellVolumeUsd)}) · net flow ${out.netFlowUsd >= 0 ? "+" : "-"}${fmtUsd(Math.abs(out.netFlowUsd))} · ${traders.size} distinct addresses${flagged.length ? ` · ${flagged.length} flagged as sandwich or wash trades` : ""}`];
        if (largest.length) {
          lines.push("Largest trades:");
          for (const e of largest) lines.push(`- ${e.kind.toUpperCase()} ${fmtUsd(e.usd)}${e.amount ? ` (${fmtNum(e.amount)} ${symbol})` : ""} · ${ago(e.at)} · by ${shortAddr(e.maker)}${e.labels.length ? ` · ${e.labels.join(", ")}` : ""}${e.tx ? ` · ${e.tx}` : ""}`);
        } else lines.push(`No trades above ${fmtUsd(minUsd)} in the last 24 hours.`);
        if (repeat.length) lines.push(`Addresses with the largest net position change: ${repeat.map(([addr, net]) => `${shortAddr(addr)} ${net >= 0 ? "+" : "-"}${fmtUsd(Math.abs(net))}`).join(", ")}`);
        return {
          data: out,
          summary: `${symbol}: ${events.length} trades > ${fmtUsd(minUsd)} in 24h, net ${out.netFlowUsd >= 0 ? "+" : "-"}${fmtUsd(Math.abs(out.netFlowUsd))} (${buys.length} buys / ${sells.length} sells)${flagged.length ? `, ${flagged.length} flagged` : ""}`,
          evidence: [evidence(info, `${symbol} large trades`, lines.join("\n"), "Codex", tokenLink(info, address))],
        };
      }
    }
    if (!info.geckoterminal || !info.dexscreener) throw new PactError("PROVIDER_UNAVAILABLE", `Trade data is not available on ${info.name} right now.`);
    let symbol = resolved.symbol;
    // GeckoTerminal's own top pool for the token (what its candle and trade endpoints index); DexScreener's pair as the fallback.
    const gtPools = await tokenPools(info.geckoterminal, address, options).catch(() => []);
    let pool = gtPools[0]?.attributes.address ?? resolved.pair?.pairAddress;
    if (!pool) {
      const pairs = await tokenPairs(info.dexscreener, [address], options);
      const best = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
      pool = best?.pairAddress;
      symbol ??= best?.baseToken.symbol;
    }
    if (!pool) throw new PactError("NOT_FOUND", `No pool was found for ${address} on ${info.name}.`);

    const trades = (await poolTrades(info.geckoterminal, pool, minUsd, options)).map((t) => ({
      kind: t.attributes.kind ?? "trade",
      usd: Number(t.attributes.volume_in_usd ?? 0),
      trader: t.attributes.tx_from_address ?? "?",
      tx: t.attributes.tx_hash,
      at: t.attributes.block_timestamp ? Date.parse(t.attributes.block_timestamp) : undefined,
    }));
    const buys = trades.filter((t) => t.kind === "buy");
    const sells = trades.filter((t) => t.kind === "sell");
    const buyVolumeUsd = buys.reduce((s, t) => s + t.usd, 0);
    const sellVolumeUsd = sells.reduce((s, t) => s + t.usd, 0);
    const largest = [...trades].sort((a, b) => b.usd - a.usd).slice(0, limit);
    const traders = new Map<string, number>();
    for (const t of trades) traders.set(t.trader, (traders.get(t.trader) ?? 0) + (t.kind === "buy" ? t.usd : -t.usd));
    const repeat = [...traders.entries()].filter(([, net]) => Math.abs(net) >= minUsd * 2).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5);

    const out: Output = { chain: info.id, address, symbol, pool, minUsd, trades: trades.length, buys: buys.length, sells: sells.length, buyVolumeUsd, sellVolumeUsd, netFlowUsd: buyVolumeUsd - sellVolumeUsd, uniqueTraders: traders.size, largest };
    const lines = [
      `${symbol ?? address} on ${info.name}, pool ${pool}: ${trades.length} trades above ${fmtUsd(minUsd)} in the last 24h · ${buys.length} buys (${fmtUsd(buyVolumeUsd)}) vs ${sells.length} sells (${fmtUsd(sellVolumeUsd)}) · net flow ${out.netFlowUsd >= 0 ? "+" : "-"}${fmtUsd(Math.abs(out.netFlowUsd))} · ${traders.size} distinct addresses`,
    ];
    if (largest.length) {
      lines.push(`Largest trades:`);
      for (const t of largest) lines.push(`- ${t.kind.toUpperCase()} ${fmtUsd(t.usd)} · ${t.at ? ago(t.at) : "?"} · by ${shortAddr(t.trader)}${t.tx ? ` · ${t.tx}` : ""}`);
    } else {
      lines.push(`No trades above ${fmtUsd(minUsd)} in the last 24 hours in this pool.`);
    }
    if (repeat.length) lines.push(`Addresses with the largest net position change: ${repeat.map(([addr, net]) => `${shortAddr(addr)} ${net >= 0 ? "+" : "-"}${fmtUsd(Math.abs(net))}`).join(", ")}`);

    return {
      data: out,
      summary: `${symbol ?? "Token"}: ${trades.length} trades > ${fmtUsd(minUsd)} in 24h, net ${out.netFlowUsd >= 0 ? "+" : "-"}${fmtUsd(Math.abs(out.netFlowUsd))} (${fmtNum(buys.length)} buys / ${fmtNum(sells.length)} sells)`,
      evidence: [evidence(info, `${symbol ?? address.slice(0, 10)} large trades`, lines.join("\n"), "GeckoTerminal", tokenLink(info, address))],
    };
  },
};
