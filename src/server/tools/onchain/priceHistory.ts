import { PactError } from "../../errors";
import type { ChainInfo } from "../../onchain/chains";
import { fmtNum, fmtPct, fmtUsd } from "../../onchain/format";
import { tokenPairs } from "../../onchain/sources/dexscreener";
import { poolOhlcv, tokenPools, type Candle } from "../../onchain/sources/geckoterminal";
import type { Tool } from "../types";
import { CHAIN_PROPERTY, evidence, requireChain, resolveToken, sourceOptions, tokenLink } from "./shared";

interface Input {
  chain: string;
  token: string;
  timeframe?: "day" | "hour" | "minute";
  points?: number;
}

interface Output {
  chain: string;
  address: string;
  symbol?: string;
  pool: string;
  timeframe: string;
  source: string;
  athUsd?: number;
  athDate?: string;
  fromAthPct?: number;
  candles: number;
  first?: number;
  last?: number;
  changePct?: number;
  high?: number;
  highAt?: string;
  low?: number;
  lowAt?: string;
  drawdownFromHighPct?: number;
  volatilityPct?: number;
  volumeTotal?: number;
  volumeTrendPct?: number;
}

const day = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);
const stamp = (ts: number, timeframe: string) => (timeframe === "hour" || timeframe === "minute" ? new Date(ts * 1000).toISOString().slice(5, 16).replace("T", " ") : day(ts));

export const priceHistoryTool: Tool<Input, Output> = {
  name: "price_history",
  description: "Price and volume history for a token: change over the window, high and low with dates, drawdown from the high, volatility, volume trend. Daily up to 365 days (aggregated across markets when CoinGecko lists the token, else from its main pool, max 100) or hourly up to 100 hours.",
  stage: "analyzing",
  inputSchema: {
    type: "object",
    properties: {
      chain: CHAIN_PROPERTY,
      token: { type: "string", description: "Symbol or contract/mint address" },
      timeframe: { type: "string", enum: ["day", "hour", "minute"], description: "default day; minute = 5-minute candles for intraday moves" },
      points: { type: "number", description: "number of candles: 7–365 days, 7–100 hours, or 12–288 five-minute candles (default 30)" },
    },
    required: ["chain", "token"],
  },
  outputSchema: { type: "object", properties: { changePct: { type: "number" }, high: { type: "number" }, low: { type: "number" } } },
  isAvailable: () => ({ available: true }),
  async execute(input, context) {
    const { info, clients } = requireChain(input.chain);
    const options = sourceOptions(context);
    const timeframe: "day" | "hour" | "minute" = input.timeframe === "hour" ? "hour" : input.timeframe === "minute" ? "minute" : "day";
    const requested = Math.max(timeframe === "minute" ? 12 : 7, Math.floor(input.points ?? (timeframe === "minute" ? 72 : 30)));
    const canPool = Boolean(info.geckoterminal && info.dexscreener);
    const codexReady = Boolean(clients.codex && clients.codexNetwork);
    if (!canPool && !codexReady && !(clients.coingecko && clients.coingeckoPlatform)) throw new PactError("PROVIDER_UNAVAILABLE", `Price history is not available on ${info.name} yet: no market indexer covers it.`);
    const resolved = await resolveToken(info, clients, input.token, options);
    const { address } = resolved;

    // Minute candles come from Codex only; hourly and daily go to Codex when no pool indexer covers the chain.
    if (codexReady && (timeframe === "minute" || !canPool)) {
      const resolution = timeframe === "minute" ? "5" : timeframe === "hour" ? "60" : "1D";
      const span = timeframe === "minute" ? 300_000 : timeframe === "hour" ? 3_600_000 : 86_400_000;
      const n = Math.min(timeframe === "minute" ? 288 : timeframe === "hour" ? 100 : 365, requested);
      const bars = await clients.codex!.bars(clients.codexNetwork!, address, resolution, Date.now() - n * span, Date.now(), options).catch(() => []);
      if (bars.length >= 2) return summarise(info, address, resolved.symbol, "all pools (Codex)", timeframe, bars, "Codex", {});
      if (timeframe === "minute") throw new PactError("NOT_FOUND", `No minute candles for ${resolved.symbol ?? address} on ${info.name}.`);
    }

    // Daily history: CoinGecko first (aggregated across all markets, up to a year), then the main pool's candles.
    if (timeframe === "day" && clients.coingecko && clients.coingeckoPlatform) {
      const coin = await clients.coingecko.coinByContract(clients.coingeckoPlatform, address, options).catch(() => null);
      if (coin) {
        const days = Math.min(365, requested);
        const series = await clients.coingecko.dailyHistory(coin.id, days, options).catch(() => []);
        if (series.length >= 2) return summarise(info, address, coin.symbol.toUpperCase(), `CoinGecko (${coin.id})`, "day", series.map((s) => [Math.floor(s.at / 1000), s.price, s.price, s.price, s.price, s.volume] as Candle), "CoinGecko", { athUsd: coin.athUsd, athDate: coin.athDate?.slice(0, 10), fromAthPct: coin.athChangePct });
      }
    }
    if (!canPool) throw new PactError("NOT_FOUND", `${resolved.symbol ?? address} has no price history on ${info.name} from the sources available.`);
    if (timeframe === "minute") throw new PactError("PROVIDER_UNAVAILABLE", "Minute candles need CODEX_API_KEY.");
    const points = Math.min(100, requested);

    // The main pool: the most liquid DexScreener pair, else GeckoTerminal's top pool for the token.
    let symbol = resolved.symbol;
    // GeckoTerminal's own top pool for the token (what its candle and trade endpoints index); DexScreener's pair as the fallback.
    const gtPools = await tokenPools(info.geckoterminal!, address, options).catch(() => []);
    let pool = gtPools[0]?.attributes.address ?? resolved.pair?.pairAddress;
    if (!pool) {
      const pairs = await tokenPairs(info.dexscreener!, [address], options);
      const best = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
      pool = best?.pairAddress;
      symbol ??= best?.baseToken.symbol;
    }
    if (!pool) throw new PactError("NOT_FOUND", `No pool with price history was found for ${address} on ${info.name}.`);

    const raw = await poolOhlcv(info.geckoterminal!, pool, timeframe, 1, points, options);
    const candles: Candle[] = [...raw].filter((c) => c[4] > 0).sort((a, b) => a[0] - b[0]);
    if (candles.length < 2) throw new PactError("NOT_FOUND", `Not enough price history for ${symbol ?? address} in that pool.`);
    return summarise(info, address, symbol, `main pool ${pool}`, timeframe, candles, "GeckoTerminal", {}, pool);
  },
};

function summarise(info: ChainInfo, address: string, symbol: string | undefined, source: string, timeframe: "day" | "hour" | "minute", candles: Candle[], provider: string, ath: { athUsd?: number; athDate?: string; fromAthPct?: number }, pool = "") {
  {

    const first = candles[0][4];
    const last = candles[candles.length - 1][4];
    const high = candles.reduce((m, c) => (c[2] > m[2] ? c : m), candles[0]);
    const low = candles.reduce((m, c) => (c[3] < m[3] ? c : m), candles[0]);
    const returns = candles.slice(1).map((c, i) => (c[4] - candles[i][4]) / candles[i][4]);
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const volatility = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length) * 100;
    const volumes = candles.map((c) => c[5]);
    const volumeTotal = volumes.reduce((s, v) => s + v, 0);
    const half = Math.floor(candles.length / 2);
    const earlyVol = volumes.slice(0, half).reduce((s, v) => s + v, 0) / Math.max(1, half);
    const lateVol = volumes.slice(half).reduce((s, v) => s + v, 0) / Math.max(1, candles.length - half);
    const best = returns.reduce((m, r, i) => (r > returns[m] ? i : m), 0);
    const worst = returns.reduce((m, r, i) => (r < returns[m] ? i : m), 0);

    const out: Output = {
      chain: info.id,
      address,
      symbol,
      pool,
      timeframe,
      source: provider,
      athUsd: ath.athUsd,
      athDate: ath.athDate,
      fromAthPct: ath.fromAthPct,
      candles: candles.length,
      first,
      last,
      changePct: ((last - first) / first) * 100,
      high: high[2],
      highAt: stamp(high[0], timeframe),
      low: low[3],
      lowAt: stamp(low[0], timeframe),
      drawdownFromHighPct: ((last - high[2]) / high[2]) * 100,
      volatilityPct: volatility,
      volumeTotal,
      volumeTrendPct: earlyVol > 0 ? ((lateVol - earlyVol) / earlyVol) * 100 : undefined,
    };

    const unit = timeframe === "hour" ? "hours" : timeframe === "minute" ? "five-minute candles" : "days";
    const stepLabel = timeframe === "minute" ? "5-minute candle" : timeframe;
    const lines = [
      `${symbol ?? address} on ${info.name}, ${source}, ${candles.length} ${unit} of ${timeframe === "hour" ? "hourly" : timeframe === "minute" ? "5-minute" : "daily"} ${provider === "CoinGecko" ? "closes aggregated across all markets" : "candles"} (${stamp(candles[0][0], timeframe)} → ${stamp(candles[candles.length - 1][0], timeframe)})`,
      `Close ${fmtUsd(first)} → ${fmtUsd(last)} (${fmtPct(out.changePct)}) · high ${fmtUsd(high[2])} on ${out.highAt} · low ${fmtUsd(low[3])} on ${out.lowAt} · now ${fmtPct(out.drawdownFromHighPct)} from the window high`,
      `Volatility ${volatility.toFixed(1)}% per ${stepLabel} (std dev of returns) · best ${stepLabel} ${fmtPct(returns[best] * 100)} on ${stamp(candles[best + 1][0], timeframe)} · worst ${fmtPct(returns[worst] * 100)} on ${stamp(candles[worst + 1][0], timeframe)}`,
      `Volume ${fmtUsd(volumeTotal)} over the window · second half vs first half ${fmtPct(out.volumeTrendPct)} · average ${fmtUsd(volumeTotal / candles.length)} per ${stepLabel}`,
    ];
    // A sampled series the reader can scan: at most 12 rows.
    const step = Math.max(1, Math.ceil(candles.length / 12));
    const sampled = candles.filter((_, i) => i % step === 0 || i === candles.length - 1);
    lines.push("Series (close, volume): " + sampled.map((c) => `${stamp(c[0], timeframe)} ${fmtUsd(c[4])} / ${fmtUsd(c[5])}`).join(" · "));
    if (ath.athUsd) lines.push(`All-time high ${fmtUsd(ath.athUsd)} on ${ath.athDate ?? "?"}; the latest close is ${fmtPct(ath.fromAthPct)} from it.`);

    return {
      data: out,
      summary: `${symbol ?? "Token"}: ${fmtPct(out.changePct)} over ${candles.length} ${unit}, ${fmtPct(out.drawdownFromHighPct)} from the window high${ath.fromAthPct !== undefined ? `, ${fmtPct(ath.fromAthPct)} from ATH` : ""}, volatility ${fmtNum(volatility, 1)}%/${stepLabel}`,
      evidence: [evidence(info, `${symbol ?? address.slice(0, 10)} price history`, lines.join("\n"), provider, tokenLink(info, address))],
    };
  }
}
