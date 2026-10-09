// The chains Pact Onchain knows. Everything here is public configuration:
// chain ids, public RPC endpoints, explorer links, and the slug each data
// source uses for the chain. Keys never live here.

export const CHAIN_IDS = ["robinhood", "base", "bnb", "solana"] as const;
export type ChainId = (typeof CHAIN_IDS)[number];

export type ChainFamily = "evm" | "solana";

export interface ChainInfo {
  id: ChainId;
  name: string;
  family: ChainFamily;
  /** EVM chain id; undefined for Solana. */
  chainId?: number;
  nativeSymbol: string;
  nativeDecimals: number;
  rpc: string;
  /** Explorer site for links shown to people. EVM history comes from Blockscout (Robinhood) or Ankr (Base, BNB). */
  explorer: { kind: "blockscout" | "solscan"; url: string };
  /** Slug on DexScreener, when indexed. */
  dexscreener?: string;
  /** Network id on GeckoTerminal, when indexed. */
  geckoterminal?: string;
  /** Chain id on GoPlus, when supported. */
  goplus?: string;
  /** Chain slug on DefiLlama (prices use `${slug}:${address}`). */
  defillama?: string;
  /** Name DefiLlama's chain list uses. */
  defillamaChainName?: string;
  /** Chain slug on Ankr's Advanced API, for chains whose history comes from there instead of Blockscout. */
  ankr?: string;
  /** Alchemy network slug (RPC, transfers, priced balances). */
  alchemy?: string;
  /** NodeReal MegaNode covers this chain (BNB Chain only). */
  nodereal?: boolean;
  /** CoinGecko asset platform id. */
  coingecko?: string;
  /** Codex network id. */
  codex?: number;
}

/** Blockscout's unified API in its Etherscan-compatible form: `chainid` selects the network. */
export const BLOCKSCOUT_API = "https://api.blockscout.com/v2/api";

export const CHAINS: Record<ChainId, ChainInfo> = {
  robinhood: {
    id: "robinhood",
    name: "Robinhood Chain",
    family: "evm",
    chainId: 4663,
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: { kind: "blockscout", url: "https://robinhoodchain.blockscout.com" },
    alchemy: "robinhood-mainnet",
    coingecko: "robinhood",
    codex: 4663,
    // Not yet indexed by the DEX market and security sources below (checked October 2026).
  },
  base: {
    id: "base",
    name: "Base",
    family: "evm",
    chainId: 8453,
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    rpc: "https://mainnet.base.org",
    explorer: { kind: "blockscout", url: "https://base.blockscout.com" },
    dexscreener: "base",
    geckoterminal: "base",
    goplus: "8453",
    defillama: "base",
    defillamaChainName: "Base",
    ankr: "base",
    alchemy: "base-mainnet",
    coingecko: "base",
    codex: 8453,
  },
  bnb: {
    id: "bnb",
    name: "BNB Chain",
    family: "evm",
    chainId: 56,
    nativeSymbol: "BNB",
    nativeDecimals: 18,
    rpc: "https://bsc-dataseed.bnbchain.org",
    explorer: { kind: "blockscout", url: "https://bscscan.com" },
    dexscreener: "bsc",
    geckoterminal: "bsc",
    goplus: "56",
    defillama: "bsc",
    defillamaChainName: "BSC",
    ankr: "bsc",
    alchemy: "bnb-mainnet",
    nodereal: true,
    coingecko: "binance-smart-chain",
    codex: 56,
  },
  solana: {
    id: "solana",
    name: "Solana",
    family: "solana",
    nativeSymbol: "SOL",
    nativeDecimals: 9,
    rpc: "https://api.mainnet-beta.solana.com",
    explorer: { kind: "solscan", url: "https://solscan.io" },
    dexscreener: "solana",
    geckoterminal: "solana",
    goplus: "solana",
    defillama: "solana",
    defillamaChainName: "Solana",
    alchemy: "solana-mainnet",
    coingecko: "solana",
    codex: 1399811149,
  },
};

export function isChainId(value: unknown): value is ChainId {
  return typeof value === "string" && (CHAIN_IDS as readonly string[]).includes(value);
}

export function chainInfo(id: ChainId): ChainInfo {
  return CHAINS[id];
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EVM_TX = /^0x[0-9a-fA-F]{64}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{80,92}$/;

export const isEvmAddress = (s: string) => EVM_ADDRESS.test(s);
export const isEvmTxHash = (s: string) => EVM_TX.test(s);
export const isSolanaAddress = (s: string) => SOLANA_ADDRESS.test(s);
export const isSolanaSignature = (s: string) => SOLANA_SIGNATURE.test(s);

/** Address or transaction identifiers found in free text. */
export function findIdentifiers(text: string): { evmAddresses: string[]; evmTxHashes: string[]; solanaAddresses: string[]; solanaSignatures: string[] } {
  const words = text.split(/[\s,;()"'<>\[\]]+/).map((w) => w.replace(/[.:!?]+$/, ""));
  const uniq = (arr: string[]) => [...new Set(arr)];
  return {
    evmAddresses: uniq(words.filter(isEvmAddress)),
    evmTxHashes: uniq(words.filter(isEvmTxHash)),
    solanaAddresses: uniq(words.filter((w) => isSolanaAddress(w) && !/^[a-z]+$/i.test(w))),
    solanaSignatures: uniq(words.filter(isSolanaSignature)),
  };
}

const CHAIN_WORDS: [RegExp, ChainId][] = [
  [/\b(robinhood( chain)?|rh chain)\b/i, "robinhood"],
  [/\b(solana|sol chain|on sol)\b/i, "solana"],
  [/\b(bnb( chain)?|bsc|binance smart chain|binance chain)\b/i, "bnb"],
  [/\b(base( chain| network)?)\b/i, "base"],
];

/** The chain a job names, if any. "base" alone is only taken as a chain when it is capitalised or paired with chain/network. */
export function chainMentionedIn(text: string): ChainId | undefined {
  for (const [re, id] of CHAIN_WORDS) {
    if (id === "base") {
      if (/\bBase\b/.test(text) || /\bbase (chain|network|mainnet)\b/i.test(text)) return "base";
      continue;
    }
    if (re.test(text)) return id;
  }
  return undefined;
}

/** Explorer links, for evidence the reader can follow. */
export function explorerLink(chain: ChainInfo, kind: "address" | "token" | "tx", id: string): string {
  const base = chain.explorer.url;
  if (chain.explorer.kind === "solscan") return kind === "tx" ? `${base}/tx/${id}` : kind === "token" ? `${base}/token/${id}` : `${base}/account/${id}`;
  return kind === "tx" ? `${base}/tx/${id}` : kind === "token" ? `${base}/token/${id}` : `${base}/address/${id}`;
}
