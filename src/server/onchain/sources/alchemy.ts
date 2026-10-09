import type { ContractVerification, EvmExplorer, ExplorerHolder, ExplorerTokenBalance, ExplorerTokenInfo, ExplorerTx, ExplorerTxDetail, Options } from "../explorer";
import { fetchJson, rpc } from "../http";

// Alchemy (free tier): enhanced RPC on Base, BNB Chain, Robinhood Chain and
// Solana. Used for RPC endpoints, transfer history (Transfers API), priced
// token balances (Portfolio API) and token metadata. Second in line behind
// Ankr / Blockscout, first for RPC.

const VENDOR = "Alchemy";

export function alchemyRpcUrl(network: string, apiKey: string): string {
  return `https://${network}.g.alchemy.com/v2/${apiKey}`;
}

interface Transfer {
  hash: string;
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: string;
  rawContract?: { value?: string | null; address?: string | null; decimal?: string | null };
  metadata?: { blockTimestamp?: string };
}

interface PortfolioToken {
  network: string;
  tokenAddress: string | null;
  tokenBalance: string;
  tokenMetadata?: { symbol?: string | null; decimals?: number | null; name?: string | null };
  tokenPrices?: { currency: string; value: string }[];
}

export class AlchemyExplorer implements EvmExplorer {
  readonly vendor = VENDOR;
  private readonly url: string;

  constructor(
    private readonly network: string,
    private readonly apiKey: string,
    private readonly nativeDecimals: number,
  ) {
    this.url = alchemyRpcUrl(network, apiKey);
  }

  async recentTransactions(address: string, limit: number, options: Options): Promise<ExplorerTx[]> {
    const base = { category: ["external", "erc20"], order: "desc", maxCount: "0x" + Math.min(limit, 50).toString(16), withMetadata: true, excludeZeroValue: false };
    // Outgoing and incoming in one batched request.
    const [out, inc] = await rpc<{ transfers?: Transfer[] }>(
      this.url,
      [
        { method: "alchemy_getAssetTransfers", params: [{ ...base, fromAddress: address }] },
        { method: "alchemy_getAssetTransfers", params: [{ ...base, toAddress: address }] },
      ],
      { ...options, vendor: VENDOR },
    );
    const seen = new Set<string>();
    const txs: ExplorerTx[] = [];
    for (const t of [...(out.transfers ?? []), ...(inc.transfers ?? [])]) {
      if (seen.has(t.hash)) continue;
      seen.add(t.hash);
      const native = t.category === "external";
      const raw = t.rawContract?.value ? BigInt(t.rawContract.value).toString() : "0";
      txs.push({
        hash: t.hash,
        from: t.from,
        to: t.to,
        valueWei: native ? raw : "0",
        timestamp: t.metadata?.blockTimestamp ? Date.parse(t.metadata.blockTimestamp) : undefined,
        method: native ? "transfer" : "token transfer",
        summary: native ? undefined : `${t.value ?? "?"} ${t.asset ?? "tokens"} ${t.from.toLowerCase() === address.toLowerCase() ? "sent" : "received"}`,
      });
    }
    return txs.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)).slice(0, limit);
  }

  async tokenBalances(address: string, options: Options): Promise<ExplorerTokenBalance[]> {
    const data = await fetchJson<{ data?: { tokens?: PortfolioToken[] } }>(`https://api.g.alchemy.com/data/v1/${this.apiKey}/assets/tokens/by-address`, {
      ...options,
      vendor: VENDOR,
      method: "POST",
      body: { addresses: [{ address, networks: [this.network] }], withMetadata: true, withPrices: true, includeNativeTokens: true },
    });
    return (data.data?.tokens ?? []).map((t) => {
      const native = !t.tokenAddress;
      const decimals = native ? this.nativeDecimals : (t.tokenMetadata?.decimals ?? 18);
      const raw = BigInt(t.tokenBalance || "0x0").toString();
      const price = Number(t.tokenPrices?.find((p) => p.currency === "usd")?.value ?? NaN);
      const amount = Number(raw) / 10 ** decimals;
      return { address: t.tokenAddress ?? "native", symbol: t.tokenMetadata?.symbol || (native ? "native" : "?"), name: t.tokenMetadata?.name ?? undefined, decimals, raw, usd: Number.isFinite(price) ? amount * price : undefined, native };
    });
  }

  async tokenInfo(address: string, options: Options): Promise<ExplorerTokenInfo | null> {
    const [meta] = await rpc<{ name?: string | null; symbol?: string | null; decimals?: number | null }>(this.url, [{ method: "alchemy_getTokenMetadata", params: [address] }], { ...options, vendor: VENDOR });
    if (!meta || (!meta.name && !meta.symbol)) return null;
    return { address, name: meta.name ?? undefined, symbol: meta.symbol ?? undefined, decimals: meta.decimals ?? undefined };
  }

  async tokenHolders(): Promise<ExplorerHolder[]> {
    return [];
  }

  async contractVerification(): Promise<ContractVerification | null> {
    return null;
  }

  async transactionDetail(): Promise<ExplorerTxDetail | null> {
    return null;
  }
}
