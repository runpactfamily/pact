import { PactError } from "../../errors";
import { CHAIN_IDS, chainInfo, explorerLink, isChainId, isEvmAddress, isSolanaAddress, type ChainId, type ChainInfo } from "../../onchain/chains";
import { chainClients, type ChainClients } from "../../onchain/index";
import { bestPair, searchPairs, type DexPair } from "../../onchain/sources/dexscreener";
import type { Evidence, ToolContext } from "../types";

// Shared pieces for the onchain tools: the chain parameter, request options,
// token resolution (symbol or address → address), and evidence records.

export const CHAIN_PROPERTY = { type: "string", enum: [...CHAIN_IDS], description: "robinhood | base | bnb | solana" };

export interface SourceOptions {
  timeoutMs: number;
  signal: AbortSignal;
}

export function sourceOptions(context: ToolContext): SourceOptions {
  // Each tool makes a few calls; give each one a share of the tool timeout.
  return { timeoutMs: Math.max(5_000, Math.floor(context.timeoutMs / 2)), signal: context.signal };
}

export function requireChain(raw: unknown): { info: ChainInfo; clients: ChainClients } {
  if (!isChainId(raw)) throw new PactError("INVALID_REQUEST", `Pick a chain: ${CHAIN_IDS.join(", ")}.`);
  return { info: chainInfo(raw), clients: chainClients(raw) };
}

export function evidence(info: ChainInfo, label: string, text: string, provider: string, url?: string): Evidence {
  return { kind: "chain", label: `${label} (${info.name})`, text: text.slice(0, 6_000), provider, url };
}

export function isAddressFor(info: ChainInfo, value: string): boolean {
  return info.family === "solana" ? isSolanaAddress(value) : isEvmAddress(value);
}

export interface ResolvedToken {
  address: string;
  symbol?: string;
  name?: string;
  /** The most liquid pair, when a market indexer knows the token. */
  pair?: DexPair;
  /** All pairs returned by the search, for callers that aggregate. */
  pairs: DexPair[];
  resolvedVia: "address" | "dexscreener";
}

/**
 * Turns "PEPE", "$pepe", or an address into a token address on the chain.
 * Costs one request when a symbol has to be looked up, none for an address.
 */
export async function resolveToken(info: ChainInfo, clients: ChainClients, query: string, options: SourceOptions): Promise<ResolvedToken> {
  // "$CAKE" and "CAKE" are the same ask; the cashtag sign is never part of a symbol or address.
  const value = query.trim().replace(/^\$+/, "").trim();
  if (!value) throw new PactError("INVALID_REQUEST", "Name the token (symbol or contract address).");
  if (isAddressFor(info, value)) return { address: value, pairs: [], resolvedVia: "address" };
  if (info.family === "evm" && isSolanaAddress(value)) throw new PactError("INVALID_REQUEST", `${value.slice(0, 8)}… looks like a Solana address; choose chain=solana.`);
  if (info.family === "solana" && isEvmAddress(value)) throw new PactError("INVALID_REQUEST", `${value.slice(0, 8)}… is an EVM address; choose base, bnb or robinhood.`);

  if (info.dexscreener) {
    const pairs = (await searchPairs(value, options)).filter((p) => p.chainId === info.dexscreener);
    const pair = bestPair(pairs, value);
    if (pair) return { address: pair.baseToken.address, symbol: pair.baseToken.symbol, name: pair.baseToken.name, pair, pairs, resolvedVia: "dexscreener" };
    throw new PactError("NOT_FOUND", `No token called "${value}" is listed on ${info.name} DEXes. Give the contract address if you have it.`);
  }
  void clients;
  throw new PactError("NOT_FOUND", `Token search by name is not available on ${info.name} yet; give the contract address.`);
}

export function tokenLink(info: ChainInfo, address: string): string {
  return explorerLink(info, "token", address);
}

export function chainIdFrom(value: unknown): ChainId | undefined {
  return isChainId(value) ? value : undefined;
}
