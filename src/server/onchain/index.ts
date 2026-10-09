import { getConfig } from "../config";
import { BLOCKSCOUT_API, CHAIN_IDS, CHAINS, type ChainId, type ChainInfo } from "./chains";
import { ExplorerChain, type EvmExplorer } from "./explorer";
import { AlchemyExplorer, alchemyRpcUrl } from "./sources/alchemy";
import { AnkrExplorer } from "./sources/ankr";
import { BlockscoutExplorer } from "./sources/blockscout";
import { Codex } from "./sources/codex";
import { CoinGecko } from "./sources/coingecko";
import { EvmRpc } from "./sources/evmRpc";
import { NodeRealExplorer, noderealRpcUrl } from "./sources/nodereal";
import { SolanaRpc } from "./sources/solanaRpc";

// What each chain can do with the credentials at hand. Public RPCs always
// work; explorer, market and security coverage depends on the chain and keys.
// Nothing here is simulated: a chain without a market indexer says so.

export interface ChainCapabilities {
  id: ChainId;
  name: string;
  family: ChainInfo["family"];
  nativeSymbol: string;
  rpc: true;
  /** Transaction history, token balances, contract verification. */
  explorer: boolean;
  /** Prices, pairs, volume, trending and new tokens. */
  market: boolean;
  /** Contract and mint risk checks. */
  security: boolean;
  /** Vendors answering for this chain, for the record. */
  vendors: string[];
  notes: string[];
}

/** Explorers for an EVM chain, best first. Empty when no key applies. */
function evmExplorers(info: ChainInfo): EvmExplorer[] {
  const { keys } = getConfig();
  const out: EvmExplorer[] = [];
  if (info.ankr && keys.ankr) out.push(new AnkrExplorer(info.ankr, keys.ankr));
  if (!info.ankr && keys.blockscout && info.chainId) out.push(new BlockscoutExplorer(BLOCKSCOUT_API, info.chainId, keys.blockscout));
  if (info.nodereal && keys.nodereal) out.push(new NodeRealExplorer(keys.nodereal));
  if (info.alchemy && keys.alchemy) out.push(new AlchemyExplorer(info.alchemy, keys.alchemy, info.nativeDecimals));
  return out;
}

function evmRpcUrl(info: ChainInfo): { url: string; vendor: string } {
  const { keys } = getConfig();
  if (info.alchemy && keys.alchemy) return { url: alchemyRpcUrl(info.alchemy, keys.alchemy), vendor: "Alchemy" };
  if (info.nodereal && keys.nodereal) return { url: noderealRpcUrl(keys.nodereal), vendor: "NodeReal" };
  return { url: info.rpc, vendor: `${info.name} RPC` };
}

export function chainCapabilities(id: ChainId): ChainCapabilities {
  const info = CHAINS[id];
  const { keys } = getConfig();
  const notes: string[] = [];
  const vendors: string[] = [];
  let explorer = true;
  if (info.family === "evm") {
    const explorers = evmExplorers(info);
    vendors.push(evmRpcUrl(info).vendor, ...explorers.map((e) => e.vendor));
    if (!explorers.length) {
      explorer = false;
      notes.push(`Transaction history and token balances need ${info.ankr ? "ANKR_API_KEY or ALCHEMY_API_KEY" : "BLOCKSCOUT_API_KEY or ALCHEMY_API_KEY"}.`);
    }
  } else {
    vendors.push(keys.helius ? "Helius" : keys.alchemy ? "Alchemy" : "Solana RPC");
    if (!keys.helius) notes.push("Without HELIUS_API_KEY, wallet holdings are listed without prices and token metadata comes from market data only.");
  }
  const codex = Boolean(keys.codex && info.codex);
  const market = Boolean(info.dexscreener || info.geckoterminal || codex);
  if (info.dexscreener || info.geckoterminal) vendors.push("DexScreener", "GeckoTerminal", "DefiLlama");
  else if (codex) notes.push(`On ${info.name}, DEX prices, trending and new tokens come from Codex only.`);
  else notes.push(`${info.name} is not indexed by the DEX data sources yet; pair-level prices, trending and new-token data are unavailable there.`);
  if (codex) vendors.push("Codex");
  else notes.push("CODEX_API_KEY unlocks the token screener, sniper/insider/developer shares, launchpad data and minute candles.");
  if (keys.coingecko && info.coingecko) vendors.push("CoinGecko");
  else if (info.coingecko) notes.push("COINGECKO_API_KEY unlocks all-time highs, ranks, exchange listings and year-long price history.");
  const security = Boolean(info.goplus);
  if (security) vendors.push("GoPlus");
  else notes.push(`Contract risk checks are limited to verification status and holder concentration on ${info.name}.`);
  return { id, name: info.name, family: info.family, nativeSymbol: info.nativeSymbol, rpc: true, explorer, market, security, vendors: [...new Set(vendors)], notes };
}

export function allChainCapabilities(): ChainCapabilities[] {
  return CHAIN_IDS.map(chainCapabilities);
}

export interface ChainClients {
  info: ChainInfo;
  evm: EvmRpc | null;
  solana: SolanaRpc | null;
  /** History, balances, verification; null without a key that covers the chain. */
  explorer: EvmExplorer | null;
  /** CoinGecko, when a key is set and the chain is a CoinGecko platform. */
  coingecko: CoinGecko | null;
  /** The CoinGecko platform id for this chain. */
  coingeckoPlatform?: string;
  /** Codex, when a key is set. */
  codex: Codex | null;
  /** The Codex network id for this chain. */
  codexNetwork?: number;
}

/** Clients for one chain, built from config on each call (cheap: no connections are opened). */
export function chainClients(id: ChainId): ChainClients {
  const info = CHAINS[id];
  const { keys } = getConfig();
  const coingecko = keys.coingecko && info.coingecko ? new CoinGecko(keys.coingecko) : null;
  const codex = keys.codex && info.codex ? new Codex(keys.codex) : null;
  if (info.family === "solana") {
    const url = keys.helius ? `https://mainnet.helius-rpc.com/?api-key=${keys.helius}` : info.alchemy && keys.alchemy ? alchemyRpcUrl(info.alchemy, keys.alchemy) : info.rpc;
    return { info, evm: null, solana: new SolanaRpc(url, Boolean(keys.helius)), explorer: null, coingecko, coingeckoPlatform: info.coingecko, codex, codexNetwork: info.codex };
  }
  const explorers = evmExplorers(info);
  const rpc = evmRpcUrl(info);
  return {
    info,
    evm: new EvmRpc(rpc.url, rpc.vendor),
    solana: null,
    explorer: explorers.length ? new ExplorerChain(explorers) : null,
    coingecko,
    coingeckoPlatform: info.coingecko,
    codex,
    codexNetwork: info.codex,
  };
}
