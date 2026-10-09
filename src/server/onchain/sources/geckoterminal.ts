import { fetchJson } from "../http";

// GeckoTerminal public API (CoinGecko). No key, ~30 requests a minute.
// Trending, new and top pools per network, token info with holder
// distribution and socials, OHLCV candles, large trades.

const BASE = "https://api.geckoterminal.com/api/v2";
const VENDOR = "GeckoTerminal";
const HEADERS = { accept: "application/json;version=20230302" };

export interface GtPool {
  id: string;
  attributes: {
    name: string;
    address: string;
    base_token_price_usd?: string | null;
    volume_usd?: Partial<Record<"m5" | "h1" | "h6" | "h24", string>>;
    price_change_percentage?: Partial<Record<"m5" | "h1" | "h6" | "h24", string>>;
    reserve_in_usd?: string | null;
    fdv_usd?: string | null;
    market_cap_usd?: string | null;
    pool_created_at?: string | null;
    transactions?: Partial<Record<"m5" | "h1" | "h6" | "h24", { buys: number; sells: number; buyers?: number; sellers?: number }>>;
  };
  relationships?: { base_token?: { data?: { id: string } }; quote_token?: { data?: { id: string } }; dex?: { data?: { id: string } } };
}

export interface GtToken {
  attributes: {
    address: string;
    name: string;
    symbol: string;
    decimals?: number;
    total_supply?: string | null;
    price_usd?: string | null;
    fdv_usd?: string | null;
    market_cap_usd?: string | null;
    volume_usd?: { h24?: string | null };
    total_reserve_in_usd?: string | null;
    coingecko_coin_id?: string | null;
    image_url?: string | null;
  };
}

export interface GtTokenInfo {
  attributes: {
    address: string;
    name?: string;
    symbol?: string;
    description?: string | null;
    websites?: string[];
    discord_url?: string | null;
    telegram_handle?: string | null;
    twitter_handle?: string | null;
    gt_score?: number | null;
    categories?: string[];
    holders?: { count?: number | null; distribution_percentage?: { top_10?: string | null; "11_30"?: string | null; "31_50"?: string | null; rest?: string | null } | null; last_updated?: string | null } | null;
    mint_authority?: string | null;
    freeze_authority?: string | null;
  };
}

/** [timestamp seconds, open, high, low, close, volume usd] */
export type Candle = [number, number, number, number, number, number];

export interface GtTrade {
  attributes: {
    block_timestamp?: string;
    tx_hash?: string;
    tx_from_address?: string;
    volume_in_usd?: string;
    kind?: "buy" | "sell";
    price_to_in_usd?: string;
    price_from_in_usd?: string;
    from_token_amount?: string;
    to_token_amount?: string;
  };
}

interface Options {
  timeoutMs: number;
  signal?: AbortSignal;
}

const notFoundToNull = (error: unknown) => {
  if ((error as { code?: string }).code === "NOT_FOUND") return null;
  throw error;
};

export async function trendingPools(network: string, options: Options): Promise<GtPool[]> {
  const data = await fetchJson<{ data?: GtPool[] }>(`${BASE}/networks/${network}/trending_pools?page=1`, { ...options, vendor: VENDOR, headers: HEADERS });
  return data.data ?? [];
}

export async function newPools(network: string, options: Options): Promise<GtPool[]> {
  const data = await fetchJson<{ data?: GtPool[] }>(`${BASE}/networks/${network}/new_pools?page=1`, { ...options, vendor: VENDOR, headers: HEADERS });
  return data.data ?? [];
}

/** Pools ranked by 24h volume. */
export async function topPools(network: string, options: Options): Promise<GtPool[]> {
  const data = await fetchJson<{ data?: GtPool[] }>(`${BASE}/networks/${network}/pools?page=1&sort=h24_volume_usd_desc`, { ...options, vendor: VENDOR, headers: HEADERS });
  return data.data ?? [];
}

export async function tokenInfo(network: string, address: string, options: Options): Promise<GtToken | null> {
  try {
    const data = await fetchJson<{ data?: GtToken }>(`${BASE}/networks/${network}/tokens/${address}`, { ...options, vendor: VENDOR, headers: HEADERS });
    return data.data ?? null;
  } catch (error) {
    return notFoundToNull(error);
  }
}

/** Socials, description, GT score, holder distribution. */
export async function tokenInfoExtended(network: string, address: string, options: Options): Promise<GtTokenInfo | null> {
  try {
    const data = await fetchJson<{ data?: GtTokenInfo }>(`${BASE}/networks/${network}/tokens/${address}/info`, { ...options, vendor: VENDOR, headers: HEADERS });
    return data.data ?? null;
  } catch (error) {
    return notFoundToNull(error);
  }
}

/** The token's pools, most liquid first. */
export async function tokenPools(network: string, address: string, options: Options): Promise<GtPool[]> {
  try {
    const data = await fetchJson<{ data?: GtPool[] }>(`${BASE}/networks/${network}/tokens/${address}/pools?page=1&sort=h24_volume_usd_liquidity_desc`, { ...options, vendor: VENDOR, headers: HEADERS });
    return data.data ?? [];
  } catch (error) {
    notFoundToNull(error);
    return [];
  }
}

/** Candles for a pool, newest first. timeframe day|hour|minute, aggregate e.g. 1, 4, 15. */
export async function poolOhlcv(network: string, pool: string, timeframe: "day" | "hour" | "minute", aggregate: number, limit: number, options: Options): Promise<Candle[]> {
  try {
    const data = await fetchJson<{ data?: { attributes?: { ohlcv_list?: Candle[] } } }>(`${BASE}/networks/${network}/pools/${pool}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}&currency=usd`, { ...options, vendor: VENDOR, headers: HEADERS });
    return data.data?.attributes?.ohlcv_list ?? [];
  } catch (error) {
    notFoundToNull(error);
    return [];
  }
}

/** Recent trades in a pool above a USD size (last 24 hours). */
export async function poolTrades(network: string, pool: string, minUsd: number, options: Options): Promise<GtTrade[]> {
  try {
    const data = await fetchJson<{ data?: GtTrade[] }>(`${BASE}/networks/${network}/pools/${pool}/trades?trade_volume_in_usd_greater_than=${Math.max(0, Math.floor(minUsd))}`, { ...options, vendor: VENDOR, headers: HEADERS });
    return data.data ?? [];
  } catch (error) {
    notFoundToNull(error);
    return [];
  }
}

/** Token address embedded in a pool's base_token relationship id ("base_0xabc" → "0xabc"). */
export function poolBaseToken(pool: GtPool): string | undefined {
  const id = pool.relationships?.base_token?.data?.id;
  if (!id) return undefined;
  const i = id.indexOf("_");
  return i >= 0 ? id.slice(i + 1) : id;
}
