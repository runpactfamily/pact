import { fetchJson } from "../http";

// CoinGecko Demo API (free, attribution required): aggregated market data
// across every market a token trades on, all-time high, rank, categories,
// exchange listings, daily price history up to a year, and global context.

const BASE = "https://api.coingecko.com/api/v3";
const VENDOR = "CoinGecko";

interface Options {
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface CgCoin {
  id: string;
  symbol: string;
  name: string;
  rank?: number;
  categories: string[];
  description?: string;
  homepage?: string;
  twitter?: string;
  priceUsd?: number;
  marketCapUsd?: number;
  fdvUsd?: number;
  volume24hUsd?: number;
  athUsd?: number;
  athDate?: string;
  athChangePct?: number;
  atlUsd?: number;
  atlDate?: string;
  change24hPct?: number;
  change7dPct?: number;
  change14dPct?: number;
  change30dPct?: number;
  change1yPct?: number;
  circulatingSupply?: number;
  totalSupply?: number;
  maxSupply?: number | null;
  /** Number of chains the token is deployed on, per CoinGecko. */
  platforms: number;
  /** Top markets by 24h volume: exchange name, pair target, USD volume, centralised or not. */
  tickers: { exchange: string; target: string; volumeUsd: number; trustScore?: string | null }[];
  genesisDate?: string | null;
}

interface RawCoin {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank?: number | null;
  categories?: string[];
  description?: { en?: string };
  links?: { homepage?: string[]; twitter_screen_name?: string | null };
  platforms?: Record<string, string>;
  genesis_date?: string | null;
  market_data?: {
    current_price?: { usd?: number };
    market_cap?: { usd?: number };
    fully_diluted_valuation?: { usd?: number };
    total_volume?: { usd?: number };
    ath?: { usd?: number };
    ath_date?: { usd?: string };
    ath_change_percentage?: { usd?: number };
    atl?: { usd?: number };
    atl_date?: { usd?: string };
    price_change_percentage_24h?: number;
    price_change_percentage_7d?: number;
    price_change_percentage_14d?: number;
    price_change_percentage_30d?: number;
    price_change_percentage_1y?: number;
    circulating_supply?: number;
    total_supply?: number;
    max_supply?: number | null;
  };
  tickers?: { market?: { name?: string }; target?: string; converted_volume?: { usd?: number }; trust_score?: string | null }[];
}

function toCoin(raw: RawCoin): CgCoin {
  const m = raw.market_data ?? {};
  const tickers = [...(raw.tickers ?? [])]
    .map((t) => ({ exchange: t.market?.name ?? "?", target: t.target ?? "?", volumeUsd: t.converted_volume?.usd ?? 0, trustScore: t.trust_score }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd)
    .slice(0, 6);
  return {
    id: raw.id,
    symbol: raw.symbol,
    name: raw.name,
    rank: raw.market_cap_rank ?? undefined,
    categories: raw.categories ?? [],
    description: raw.description?.en?.replace(/\s+/g, " ").trim() || undefined,
    homepage: raw.links?.homepage?.find(Boolean),
    twitter: raw.links?.twitter_screen_name || undefined,
    priceUsd: m.current_price?.usd,
    marketCapUsd: m.market_cap?.usd,
    fdvUsd: m.fully_diluted_valuation?.usd,
    volume24hUsd: m.total_volume?.usd,
    athUsd: m.ath?.usd,
    athDate: m.ath_date?.usd,
    athChangePct: m.ath_change_percentage?.usd,
    atlUsd: m.atl?.usd,
    atlDate: m.atl_date?.usd,
    change24hPct: m.price_change_percentage_24h,
    change7dPct: m.price_change_percentage_7d,
    change14dPct: m.price_change_percentage_14d,
    change30dPct: m.price_change_percentage_30d,
    change1yPct: m.price_change_percentage_1y,
    circulatingSupply: m.circulating_supply,
    totalSupply: m.total_supply,
    maxSupply: m.max_supply,
    platforms: Object.keys(raw.platforms ?? {}).filter(Boolean).length,
    tickers,
    genesisDate: raw.genesis_date,
  };
}

export class CoinGecko {
  constructor(private readonly apiKey: string) {}

  private get<T>(path: string, options: Options): Promise<T> {
    return fetchJson<T>(`${BASE}${path}`, { ...options, vendor: VENDOR, headers: { "x-cg-demo-api-key": this.apiKey } });
  }

  /** The coin behind a contract or mint address on a platform, or null when CoinGecko does not list it. */
  async coinByContract(platform: string, address: string, options: Options): Promise<CgCoin | null> {
    try {
      const raw = await this.get<RawCoin>(`/coins/${platform}/contract/${address}?localization=false&tickers=true&community_data=false&developer_data=false&sparkline=false`, options);
      return raw?.id ? toCoin(raw) : null;
    } catch (error) {
      if ((error as { code?: string }).code === "NOT_FOUND") return null;
      throw error;
    }
  }

  /** Daily closes and volumes for up to 365 days, oldest first. */
  async dailyHistory(id: string, days: number, options: Options): Promise<{ at: number; price: number; volume: number }[]> {
    const d = Math.min(365, Math.max(2, Math.floor(days)));
    const data = await this.get<{ prices?: [number, number][]; total_volumes?: [number, number][] }>(`/coins/${id}/market_chart?vs_currency=usd&days=${d}&interval=daily`, options);
    const volumes = new Map((data.total_volumes ?? []).map(([t, v]) => [Math.floor(t / 86_400_000), v]));
    return (data.prices ?? []).map(([t, p]) => ({ at: t, price: p, volume: volumes.get(Math.floor(t / 86_400_000)) ?? 0 }));
  }

  /** Global market context. */
  async global(options: Options): Promise<{ totalMarketCapUsd?: number; change24hPct?: number; btcDominancePct?: number; ethDominancePct?: number; activeCoins?: number } | null> {
    const data = await this.get<{ data?: { total_market_cap?: { usd?: number }; market_cap_change_percentage_24h_usd?: number; market_cap_percentage?: { btc?: number; eth?: number }; active_cryptocurrencies?: number } }>("/global", options);
    const g = data.data;
    if (!g) return null;
    return { totalMarketCapUsd: g.total_market_cap?.usd, change24hPct: g.market_cap_change_percentage_24h_usd, btcDominancePct: g.market_cap_percentage?.btc, ethDominancePct: g.market_cap_percentage?.eth, activeCoins: g.active_cryptocurrencies };
  }
}
