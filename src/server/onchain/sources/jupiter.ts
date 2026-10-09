import { fetchJson } from "../http";

// Jupiter's public token API (Solana). No key. Verified status, organic
// score, audit flags, holder count and 24h trading stats.

const VENDOR = "Jupiter";

interface Options {
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface JupToken {
  id: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  circSupply?: number;
  totalSupply?: number;
  tokenProgram?: string;
  holderCount?: number;
  audit?: { mintAuthorityDisabled?: boolean; freezeAuthorityDisabled?: boolean; topHoldersPercentage?: number; devBalancePercentage?: number };
  organicScore?: number;
  organicScoreLabel?: string;
  isVerified?: boolean;
  tags?: string[];
  fdv?: number;
  mcap?: number;
  usdPrice?: number;
  liquidity?: number;
  stats24h?: { priceChange?: number; holderChange?: number; liquidityChange?: number; volumeChange?: number; buyVolume?: number; sellVolume?: number; numBuys?: number; numSells?: number; numTraders?: number; numNetBuyers?: number };
  firstPool?: { id?: string; createdAt?: string };
}

/** Looks a token up by symbol, name or mint. Returns the best matches. */
export async function searchTokens(query: string, options: Options): Promise<JupToken[]> {
  const data = await fetchJson<JupToken[]>(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(query)}`, { ...options, vendor: VENDOR });
  return Array.isArray(data) ? data : [];
}

/** The entry for one mint, if Jupiter knows it. */
export async function tokenByMint(mint: string, options: Options): Promise<JupToken | null> {
  const rows = await searchTokens(mint, options);
  return rows.find((t) => t.id === mint) ?? null;
}
