import { PactError } from "../../errors";
import { fetchJson } from "../http";

// Codex (formerly Defined.fi) GraphQL API, "almost free" plan: token
// screening with a hundred filters, per-token risk metrics (snipers,
// insiders, bundlers, developer share, scam flags), launchpad lifecycle,
// buy/sell events with wash-trade labels, and candles down to one minute,
// on all four chains including Robinhood Chain. The holders list and wallet
// PnL queries sit on paid plans and are not used.

const ENDPOINT = "https://graph.codex.io/graphql";
const VENDOR = "Codex";

interface Options {
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface CodexTokenMetrics {
  address: string;
  symbol?: string;
  name?: string;
  priceUsd?: number;
  marketCap?: number;
  liquidityUsd?: number;
  volume24?: number;
  volume1?: number;
  change24?: number;
  change1?: number;
  holders?: number;
  top10HoldersPct?: number;
  sniperHeldPct?: number | null;
  insiderHeldPct?: number | null;
  bundlerHeldPct?: number | null;
  devHeldPct?: number | null;
  suspiciousCount?: number | null;
  walletAgeAvgDays?: number;
  athPriceUsd?: number;
  athAt?: number;
  trendingScore?: number;
  potentialScamReasons: string[];
  isScam?: boolean | null;
  launchpad?: { name?: string | null; protocol?: string | null; completed?: boolean | null; graduationPct?: number | null; migrated?: boolean | null } | null;
  createdAt?: number;
  buyCount24?: number;
  sellCount24?: number;
  uniqueBuys24?: number;
  uniqueSells24?: number;
  pairAddress?: string;
  exchanges: string[];
}

export interface ScreenerFilters {
  minLiquidityUsd?: number;
  minVolume24Usd?: number;
  maxAgeHours?: number;
  minHolders?: number;
  maxTop10Pct?: number;
  minMarketCapUsd?: number;
  maxMarketCapUsd?: number;
  launchpad?: "any" | "only" | "graduated" | "none";
  launchpadName?: string;
  excludeScams?: boolean;
}

export type ScreenerRanking = "trending" | "volume24" | "holders" | "change24" | "newest" | "liquidity" | "marketCap" | "graduation";

const RANKING: Record<ScreenerRanking, string> = {
  trending: "trendingScore24",
  volume24: "volume24",
  holders: "holders",
  change24: "change24",
  newest: "createdAt",
  liquidity: "liquidity",
  marketCap: "marketCap",
  graduation: "graduationPercent",
};

const RESULT_FIELDS = `
  token { address name symbol isScam createdAt launchpad { launchpadName launchpadProtocol completed graduationPercent migrated } }
  priceUSD marketCap liquidity volume24 volume1 change24 change1 holders top10HoldersPercent
  sniperHeldPercentage insiderHeldPercentage bundlerHeldPercentage devHeldPercentage suspiciousCount walletAgeAvg
  athPrice athPriceTimestamp trendingScore potentialScamReasons createdAt
  buyCount24 sellCount24 uniqueBuys24 uniqueSells24
  pair { address } exchanges { name }
`;

interface RawResult {
  token?: { address: string; name?: string; symbol?: string; isScam?: boolean | null; createdAt?: number; launchpad?: { launchpadName?: string | null; launchpadProtocol?: string | null; completed?: boolean | null; graduationPercent?: number | null; migrated?: boolean | null } | null };
  priceUSD?: string | null;
  marketCap?: string | null;
  liquidity?: string | null;
  volume24?: string | null;
  volume1?: string | null;
  change24?: string | null;
  change1?: string | null;
  holders?: number | null;
  top10HoldersPercent?: number | null;
  sniperHeldPercentage?: number | null;
  insiderHeldPercentage?: number | null;
  bundlerHeldPercentage?: number | null;
  devHeldPercentage?: number | null;
  suspiciousCount?: number | null;
  walletAgeAvg?: string | null;
  athPrice?: string | null;
  athPriceTimestamp?: number | null;
  trendingScore?: number | null;
  potentialScamReasons?: string[] | null;
  createdAt?: number | null;
  buyCount24?: number | null;
  sellCount24?: number | null;
  uniqueBuys24?: number | null;
  uniqueSells24?: number | null;
  pair?: { address?: string } | null;
  exchanges?: { name?: string }[] | null;
}

const num = (v: string | number | null | undefined): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function toMetrics(r: RawResult): CodexTokenMetrics {
  return {
    address: r.token?.address ?? "",
    symbol: r.token?.symbol ?? undefined,
    name: r.token?.name ?? undefined,
    priceUsd: num(r.priceUSD),
    marketCap: num(r.marketCap),
    liquidityUsd: num(r.liquidity),
    volume24: num(r.volume24),
    volume1: num(r.volume1),
    change24: num(r.change24) !== undefined ? num(r.change24)! * 100 : undefined,
    change1: num(r.change1) !== undefined ? num(r.change1)! * 100 : undefined,
    holders: r.holders ?? undefined,
    top10HoldersPct: r.top10HoldersPercent ?? undefined,
    sniperHeldPct: r.sniperHeldPercentage,
    insiderHeldPct: r.insiderHeldPercentage,
    bundlerHeldPct: r.bundlerHeldPercentage,
    devHeldPct: r.devHeldPercentage,
    suspiciousCount: r.suspiciousCount,
    walletAgeAvgDays: num(r.walletAgeAvg) !== undefined ? num(r.walletAgeAvg)! / 86_400 : undefined,
    athPriceUsd: num(r.athPrice),
    athAt: r.athPriceTimestamp ? r.athPriceTimestamp * 1000 : undefined,
    trendingScore: r.trendingScore ?? undefined,
    potentialScamReasons: r.potentialScamReasons ?? [],
    isScam: r.token?.isScam,
    launchpad: r.token?.launchpad ? { name: r.token.launchpad.launchpadName, protocol: r.token.launchpad.launchpadProtocol, completed: r.token.launchpad.completed, graduationPct: r.token.launchpad.graduationPercent, migrated: r.token.launchpad.migrated } : null,
    createdAt: r.createdAt ? r.createdAt * 1000 : r.token?.createdAt ? r.token.createdAt * 1000 : undefined,
    buyCount24: r.buyCount24 ?? undefined,
    sellCount24: r.sellCount24 ?? undefined,
    uniqueBuys24: r.uniqueBuys24 ?? undefined,
    uniqueSells24: r.uniqueSells24 ?? undefined,
    pairAddress: r.pair?.address ?? undefined,
    exchanges: [...new Set((r.exchanges ?? []).map((e) => e.name).filter((n): n is string => Boolean(n)))],
  };
}

export interface CodexEvent {
  kind: "Buy" | "Sell";
  at: number;
  maker: string;
  tx?: string;
  usd: number;
  amount?: number;
  labels: string[];
}

export class Codex {
  constructor(private readonly apiKey: string) {}

  private async query<T>(query: string, variables: Record<string, unknown>, options: Options): Promise<T> {
    const data = await fetchJson<{ data?: T; errors?: { message?: string }[] }>(ENDPOINT, { ...options, vendor: VENDOR, method: "POST", headers: { authorization: this.apiKey }, body: { query, variables } });
    if (data.errors?.length) {
      const message = data.errors.map((e) => e.message ?? "").join("; ");
      if (/upgrade your plan|not authorized/i.test(message)) throw new PactError("PROVIDER_UNAVAILABLE", "Codex: this query needs a paid plan.", data.errors);
      if (/rate|too many|quota/i.test(message)) throw new PactError("RATE_LIMITED", "Codex is rate-limiting requests right now.", data.errors);
      throw new PactError("MALFORMED_PROVIDER_RESPONSE", `Codex: ${message.slice(0, 160)}`, data.errors);
    }
    if (!data.data) throw new PactError("MALFORMED_PROVIDER_RESPONSE", "Codex returned no data.");
    return data.data;
  }

  /** Per-token metrics for up to 20 tokens on one network (one request). */
  async tokenMetrics(networkId: number, addresses: string[], options: Options): Promise<CodexTokenMetrics[]> {
    if (!addresses.length) return [];
    const data = await this.query<{ filterTokens?: { results?: RawResult[] } }>(
      `query ($tokens: [String!], $limit: Int) { filterTokens(tokens: $tokens, limit: $limit) { results { ${RESULT_FIELDS} } } }`,
      { tokens: addresses.slice(0, 20).map((a) => `${a}:${networkId}`), limit: 20 },
      options,
    );
    return (data.filterTokens?.results ?? []).map(toMetrics).filter((m) => m.address);
  }

  /** The screener: filters plus one ranking, up to 50 results (one request). */
  async screen(networkId: number, filters: ScreenerFilters, rankBy: ScreenerRanking, limit: number, options: Options): Promise<CodexTokenMetrics[]> {
    const now = Math.floor(Date.now() / 1000);
    const f: Record<string, unknown> = { network: [networkId] };
    if (filters.minLiquidityUsd !== undefined) f.liquidity = { gte: filters.minLiquidityUsd };
    if (filters.minVolume24Usd !== undefined && filters.minVolume24Usd > 0) f.volume24 = { gte: filters.minVolume24Usd };
    if (filters.maxAgeHours !== undefined) f.createdAt = { gte: now - Math.floor(filters.maxAgeHours * 3600) };
    if (filters.minHolders !== undefined && filters.minHolders > 0) f.holders = { gte: filters.minHolders };
    if (filters.maxTop10Pct !== undefined) f.top10HoldersPercent = { lte: filters.maxTop10Pct };
    if (filters.minMarketCapUsd !== undefined || filters.maxMarketCapUsd !== undefined) f.marketCap = { ...(filters.minMarketCapUsd !== undefined ? { gte: filters.minMarketCapUsd } : {}), ...(filters.maxMarketCapUsd !== undefined ? { lte: filters.maxMarketCapUsd } : {}) };
    // Still on the curve: not completed, not migrated, and with a graduation figure below 100 (tokens without one are usually past the curve).
    if (filters.launchpad === "only") Object.assign(f, { launchpadCompleted: false, launchpadMigrated: false, launchpadGraduationPercent: { gte: 0, lt: 100 } });
    if (filters.launchpad === "graduated") f.launchpadCompleted = true;
    if (filters.launchpadName) f.launchpadName = [filters.launchpadName];
    if (filters.excludeScams !== false) f.potentialScam = false;
    const data = await this.query<{ filterTokens?: { results?: RawResult[] } }>(
      `query ($filters: TokenFilters, $rankings: [TokenRanking], $limit: Int) { filterTokens(filters: $filters, rankings: $rankings, limit: $limit) { results { ${RESULT_FIELDS} } } }`,
      { filters: f, rankings: [{ attribute: RANKING[rankBy], direction: "DESC" }], limit: Math.min(50, Math.max(1, limit)) },
      options,
    );
    let rows = (data.filterTokens?.results ?? []).map(toMetrics).filter((m) => m.address);
    if (filters.launchpad === "none") rows = rows.filter((m) => !m.launchpad?.name);
    return rows;
  }

  /** Buy and sell events above a USD size, newest first, within a window (one request). */
  async events(networkId: number, address: string, minUsd: number, sinceMs: number, limit: number, options: Options): Promise<CodexEvent[]> {
    const data = await this.query<{ getTokenEvents?: { items?: { eventDisplayType?: string; timestamp?: number; maker?: string; transactionHash?: string; labels?: { sandwich?: unknown } | null; data?: { priceUsdTotal?: string; amountNonLiquidityToken?: string } }[] } }>(
      `query ($q: EventsQueryInput!, $limit: Int) { getTokenEvents(query: $q, limit: $limit, direction: DESC) { items { eventDisplayType timestamp maker transactionHash labels { sandwich { label } } data { ... on SwapEventData { priceUsdTotal amountNonLiquidityToken } } } } }`,
      { q: { address, networkId, eventDisplayType: ["Buy", "Sell"], priceUsdTotal: { gte: minUsd }, timestamp: { from: Math.floor(sinceMs / 1000), to: Math.floor(Date.now() / 1000) } }, limit: Math.min(200, limit) },
      options,
    );
    return (data.getTokenEvents?.items ?? [])
      .filter((e) => e.eventDisplayType === "Buy" || e.eventDisplayType === "Sell")
      .map((e) => ({
        kind: e.eventDisplayType as "Buy" | "Sell",
        at: (e.timestamp ?? 0) * 1000,
        maker: e.maker ?? "?",
        tx: e.transactionHash,
        usd: num(e.data?.priceUsdTotal) ?? 0,
        amount: num(e.data?.amountNonLiquidityToken),
        labels: [e.labels?.sandwich ? "sandwich" : ""].filter(Boolean),
      }));
  }

  /** Candles. Resolution: "1" | "5" | "15" | "60" | "240" | "1D". Returns [t, o, h, l, c, v], oldest first. */
  async bars(networkId: number, address: string, resolution: string, fromMs: number, toMs: number, options: Options): Promise<[number, number, number, number, number, number][]> {
    const data = await this.query<{ getBars?: { t?: number[]; o?: (number | null)[]; h?: (number | null)[]; l?: (number | null)[]; c?: (number | null)[]; volume?: (string | null)[] } }>(
      `query ($symbol: String!, $from: Int!, $to: Int!, $resolution: String!) { getBars(symbol: $symbol, from: $from, to: $to, resolution: $resolution, currencyCode: "USD") { t o h l c volume } }`,
      { symbol: `${address}:${networkId}`, from: Math.floor(fromMs / 1000), to: Math.floor(toMs / 1000), resolution },
      options,
    );
    const b = data.getBars;
    if (!b?.t) return [];
    return b.t.map((t, i) => [t, b.o?.[i] ?? 0, b.h?.[i] ?? 0, b.l?.[i] ?? 0, b.c?.[i] ?? 0, num(b.volume?.[i]) ?? 0] as [number, number, number, number, number, number]).filter((c) => c[4] > 0);
  }
}
