import { fetchJson } from "../http";

// DefiLlama public APIs. No key. Token prices, chain TVL and its history,
// DEX volumes, protocols per chain, stablecoin supply, yields.

const VENDOR = "DefiLlama";

interface Options {
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface LlamaPrice {
  price: number;
  symbol?: string;
  decimals?: number;
  timestamp?: number;
  confidence?: number;
}

/** Keys are `${chainSlug}:${address}`. */
export async function currentPrices(coins: string[], options: Options): Promise<Record<string, LlamaPrice>> {
  if (!coins.length) return {};
  const data = await fetchJson<{ coins?: Record<string, LlamaPrice> }>(`https://coins.llama.fi/prices/current/${coins.slice(0, 50).join(",")}?searchWidth=4h`, { ...options, vendor: VENDOR });
  return data.coins ?? {};
}

export interface LlamaChain {
  name: string;
  tvl: number;
  tokenSymbol?: string | null;
  chainId?: number | null;
  gecko_id?: string | null;
}

export async function chains(options: Options): Promise<LlamaChain[]> {
  const data = await fetchJson<LlamaChain[]>("https://api.llama.fi/v2/chains", { ...options, vendor: VENDOR });
  return Array.isArray(data) ? data : [];
}

/** Daily chain TVL, oldest first. */
export async function chainTvlHistory(chainName: string, options: Options): Promise<{ date: number; tvl: number }[]> {
  try {
    const data = await fetchJson<{ date: number; tvl: number }[]>(`https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(chainName)}`, { ...options, vendor: VENDOR });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if ((error as { code?: string }).code === "NOT_FOUND") return [];
    throw error;
  }
}

export interface DexOverview {
  total24h?: number;
  total48hto24h?: number;
  total7d?: number;
  change_1d?: number;
  change_7d?: number;
  protocols?: { name: string; total24h?: number; change_1d?: number; dominance?: number }[];
}

export async function dexOverview(chainSlug: string, options: Options): Promise<DexOverview | null> {
  try {
    return await fetchJson<DexOverview>(`https://api.llama.fi/overview/dexs/${chainSlug}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`, { ...options, vendor: VENDOR });
  } catch (error) {
    if ((error as { code?: string }).code === "NOT_FOUND") return null;
    throw error;
  }
}

export interface LlamaProtocol {
  name: string;
  slug?: string;
  category?: string;
  url?: string;
  chains?: string[];
  chainTvls?: Record<string, number>;
  change_1d?: number | null;
  change_7d?: number | null;
}

/** Protocols with TVL on a chain, largest first. The upstream list is big (every protocol); this trims it to what the chain needs. */
export async function protocolsOnChain(chainName: string, limit: number, options: Options): Promise<(LlamaProtocol & { tvlOnChain: number })[]> {
  const data = await fetchJson<LlamaProtocol[]>("https://api.llama.fi/protocols", { ...options, vendor: VENDOR });
  return (Array.isArray(data) ? data : [])
    .map((p) => ({ ...p, tvlOnChain: p.chainTvls?.[chainName] ?? 0 }))
    .filter((p) => p.tvlOnChain > 0 && !/^(cex)$/i.test(p.category ?? ""))
    .sort((a, b) => b.tvlOnChain - a.tvlOnChain)
    .slice(0, limit)
    .map(({ chainTvls: _c, ...p }) => p as LlamaProtocol & { tvlOnChain: number });
}

export interface StablecoinChain {
  name: string;
  totalCirculatingUSD?: Record<string, number>;
}

/** Stablecoin supply circulating on a chain, in USD by peg type. */
export async function stablecoinsOnChain(chainName: string, options: Options): Promise<{ totalUsd: number; byPeg: Record<string, number> } | null> {
  const data = await fetchJson<StablecoinChain[]>("https://stablecoins.llama.fi/stablecoinchains", { ...options, vendor: VENDOR });
  const row = (Array.isArray(data) ? data : []).find((c) => c.name.toLowerCase() === chainName.toLowerCase());
  if (!row?.totalCirculatingUSD) return null;
  const byPeg = row.totalCirculatingUSD;
  return { totalUsd: Object.values(byPeg).reduce((s, v) => s + (v ?? 0), 0), byPeg };
}

export interface LlamaYield {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy?: number | null;
  apyBase?: number | null;
  apyReward?: number | null;
  stablecoin?: boolean;
  ilRisk?: string;
  exposure?: string;
}

/** Yield pools on a chain above a TVL floor, best APY first. Upstream list is large; trimmed here. */
export async function yieldsOnChain(chainName: string, minTvlUsd: number, limit: number, options: Options): Promise<LlamaYield[]> {
  const data = await fetchJson<{ data?: LlamaYield[] }>("https://yields.llama.fi/pools", { ...options, vendor: VENDOR });
  return (data.data ?? [])
    .filter((y) => y.chain.toLowerCase() === chainName.toLowerCase() && y.tvlUsd >= minTvlUsd && (y.apy ?? 0) > 0 && (y.apy ?? 0) < 1000)
    .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))
    .slice(0, limit);
}
