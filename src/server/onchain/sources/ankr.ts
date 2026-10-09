import type { ContractVerification, EvmExplorer, ExplorerHolder, ExplorerTokenBalance, ExplorerTokenInfo, ExplorerTx, ExplorerTxDetail, Options } from "../explorer";
import { rpc } from "../http";
import { KNOWN_SELECTORS } from "./evmRpc";

// Ankr Advanced API (freemium) for Base and BNB Chain: wallet transactions,
// balances with USD values, token holders and prices. One key, both chains.
// It has no verification flag; on these chains GoPlus answers that.

const VENDOR = "Ankr";

interface AnkrTx {
  hash: string;
  from: string;
  to?: string | null;
  value: string;
  input?: string;
  timestamp?: string;
  status?: string;
}

interface AnkrAsset {
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  tokenType?: string;
  contractAddress?: string;
  balanceRawInteger?: string;
  balanceUsd?: string;
}

export class AnkrExplorer implements EvmExplorer {
  readonly vendor = VENDOR;
  private readonly url: string;

  constructor(
    private readonly blockchain: string,
    apiKey: string,
  ) {
    this.url = `https://rpc.ankr.com/multichain/${apiKey}`;
  }

  private call<T>(method: string, params: Record<string, unknown>, options: Options): Promise<T> {
    return rpc<T>(this.url, [{ method, params }], { ...options, vendor: VENDOR }).then((r) => r[0]);
  }

  async recentTransactions(address: string, limit: number, options: Options): Promise<ExplorerTx[]> {
    const data = await this.call<{ transactions?: AnkrTx[] }>("ankr_getTransactionsByAddress", { blockchain: this.blockchain, address, pageSize: limit, descOrder: true, includeLogs: false }, options);
    return (data.transactions ?? []).map((t) => {
      const input = t.input ?? "0x";
      return {
        hash: t.hash,
        from: t.from,
        to: t.to ?? null,
        valueWei: BigInt(t.value || "0x0").toString(),
        timestamp: t.timestamp ? Number(BigInt(t.timestamp)) * 1000 : undefined,
        method: input === "0x" ? "transfer" : KNOWN_SELECTORS[input.slice(0, 10).toLowerCase()] ?? input.slice(0, 10),
        failed: t.status !== undefined && Number(BigInt(t.status)) === 0,
      };
    });
  }

  async tokenBalances(address: string, options: Options): Promise<ExplorerTokenBalance[]> {
    const data = await this.call<{ assets?: AnkrAsset[] }>("ankr_getAccountBalance", { blockchain: [this.blockchain], walletAddress: address, onlyWhitelisted: true }, options);
    return (data.assets ?? []).map((a) => ({
      address: a.contractAddress ?? "native",
      symbol: a.tokenSymbol || "?",
      name: a.tokenName,
      decimals: a.tokenDecimals ?? 18,
      raw: a.balanceRawInteger ?? "0",
      usd: a.balanceUsd !== undefined ? Number(a.balanceUsd) : undefined,
      native: a.tokenType === "NATIVE",
    }));
  }

  async tokenInfo(address: string, options: Options): Promise<ExplorerTokenInfo | null> {
    const [holders, price] = await Promise.all([
      this.call<{ latestHoldersCount?: number }>("ankr_getTokenHoldersCount", { blockchain: this.blockchain, contractAddress: address, pageSize: 1 }, options).catch(() => null),
      this.call<{ usdPrice?: string }>("ankr_getTokenPrice", { blockchain: this.blockchain, contractAddress: address }, options).catch(() => null),
    ]);
    if (!holders && !price) return null;
    const usd = Number(price?.usdPrice);
    return { address, holders: holders?.latestHoldersCount, priceUsd: Number.isFinite(usd) && usd > 0 ? usd : undefined };
  }

  async tokenHolders(address: string, limit: number, options: Options): Promise<ExplorerHolder[]> {
    const data = await this.call<{ holders?: { holderAddress: string; balanceRawInteger: string }[] }>("ankr_getTokenHolders", { blockchain: this.blockchain, contractAddress: address, pageSize: limit }, options);
    return (data.holders ?? []).map((h) => ({ address: h.holderAddress, raw: h.balanceRawInteger }));
  }

  async contractVerification(): Promise<ContractVerification | null> {
    return null;
  }

  async transactionDetail(hash: string, options: Options): Promise<ExplorerTxDetail | null> {
    const data = await this.call<{ transactions?: AnkrTx[] }>("ankr_getTransactionsByHash", { blockchain: this.blockchain, transactionHash: hash, includeLogs: false }, options);
    const tx = data.transactions?.[0];
    if (!tx) return null;
    return { timestamp: tx.timestamp ? Number(BigInt(tx.timestamp)) * 1000 : undefined };
  }
}
