import { fetchJson } from "../http";

// DexScreener public API. No key. Pairs across DEXes with price, volume,
// liquidity, transaction counts and age.

const BASE = "https://api.dexscreener.com";
const VENDOR = "DexScreener";

export interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative?: string;
  priceUsd?: string;
  txns?: Record<"m5" | "h1" | "h6" | "h24", { buys: number; sells: number }>;
  volume?: Record<"m5" | "h1" | "h6" | "h24", number>;
  priceChange?: Record<"m5" | "h1" | "h6" | "h24", number>;
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string; websites?: { label?: string; url: string }[]; socials?: { type: string; url: string }[] };
  boosts?: { active?: number };
}

export interface TokenProfile {
  url: string;
  chainId: string;
  tokenAddress: string;
  description?: string;
  links?: { type?: string; label?: string; url: string }[];
}

export interface TokenBoost extends TokenProfile {
  amount?: number;
  totalAmount?: number;
}

interface Options {
  timeoutMs: number;
  signal?: AbortSignal;
}

export async function searchPairs(query: string, options: Options): Promise<DexPair[]> {
  const data = await fetchJson<{ pairs?: DexPair[] }>(`${BASE}/latest/dex/search?q=${encodeURIComponent(query)}`, { ...options, vendor: VENDOR });
  return data.pairs ?? [];
}

/** All pairs for up to 30 token addresses on one chain. */
export async function tokenPairs(chainSlug: string, addresses: string[], options: Options): Promise<DexPair[]> {
  if (!addresses.length) return [];
  const data = await fetchJson<DexPair[]>(`${BASE}/tokens/v1/${chainSlug}/${addresses.slice(0, 30).join(",")}`, { ...options, vendor: VENDOR });
  return Array.isArray(data) ? data : [];
}

export async function latestTokenProfiles(options: Options): Promise<TokenProfile[]> {
  const data = await fetchJson<TokenProfile[]>(`${BASE}/token-profiles/latest/v1`, { ...options, vendor: VENDOR });
  return Array.isArray(data) ? data : [];
}

export async function topBoosts(options: Options): Promise<TokenBoost[]> {
  const data = await fetchJson<TokenBoost[]>(`${BASE}/token-boosts/top/v1`, { ...options, vendor: VENDOR });
  return Array.isArray(data) ? data : [];
}

/**
 * The pair that best represents a token. When several tokens share a symbol,
 * the one with the most real trading (24h volume across its pairs, with
 * liquidity as a tie-break) wins: reported liquidity alone is easy to fake.
 * Then that token's most liquid pair.
 */
export function bestPair(pairs: DexPair[], symbolOrAddress?: string): DexPair | undefined {
  if (!pairs.length) return undefined;
  const needle = symbolOrAddress?.toLowerCase();
  const byAddress = needle ? pairs.filter((p) => p.baseToken.address.toLowerCase() === needle) : [];
  const bySymbol = needle && !byAddress.length ? pairs.filter((p) => p.baseToken.symbol.toLowerCase() === needle) : [];
  const pool = byAddress.length ? byAddress : bySymbol.length ? bySymbol : pairs;
  const scores = new Map<string, number>();
  for (const p of pool) {
    const key = p.baseToken.address.toLowerCase();
    scores.set(key, (scores.get(key) ?? 0) + (p.volume?.h24 ?? 0) + 0.05 * (p.liquidity?.usd ?? 0));
  }
  const winner = [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return pool.filter((p) => p.baseToken.address.toLowerCase() === winner).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}
