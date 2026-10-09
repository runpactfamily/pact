import type { ContractVerification, EvmExplorer, ExplorerHolder, ExplorerTokenBalance, ExplorerTokenInfo, ExplorerTx, ExplorerTxDetail, Options } from "../explorer";
import { rpc } from "../http";
import { KNOWN_SELECTORS } from "./evmRpc";

// NodeReal MegaNode (free plan) for BNB Chain: an RPC endpoint plus the
// enhanced `nr_` methods for token holders, holder counts, metadata and
// transaction history. Second in line behind Ankr.

const VENDOR = "NodeReal";

export function noderealRpcUrl(apiKey: string): string {
  return `https://bsc-mainnet.nodereal.io/v1/${apiKey}`;
}

interface NrTransfer {
  hash?: string;
  from?: string;
  to?: string;
  value?: string | number;
  category?: string;
  blockTimeStamp?: string;
  rawContract?: { value?: string };
  input?: string;
}

export class NodeRealExplorer implements EvmExplorer {
  readonly vendor = VENDOR;
  private readonly url: string;

  constructor(apiKey: string) {
    this.url = noderealRpcUrl(apiKey);
  }

  async recentTransactions(address: string, limit: number, options: Options): Promise<ExplorerTx[]> {
    const base = { category: ["external"], order: "desc", maxCount: "0x" + Math.min(limit, 50).toString(16) };
    const [out, inc] = await rpc<{ transfers?: NrTransfer[] }>(
      this.url,
      [
        { method: "nr_getTransactionByAddress", params: [{ ...base, addressType: "from", address }] },
        { method: "nr_getTransactionByAddress", params: [{ ...base, addressType: "to", address }] },
      ],
      { ...options, vendor: VENDOR },
    );
    const seen = new Set<string>();
    const txs: ExplorerTx[] = [];
    for (const t of [...(out.transfers ?? []), ...(inc.transfers ?? [])]) {
      if (!t.hash || seen.has(t.hash)) continue;
      seen.add(t.hash);
      const raw = t.rawContract?.value ?? (typeof t.value === "string" && t.value.startsWith("0x") ? t.value : undefined);
      const input = t.input ?? "0x";
      txs.push({
        hash: t.hash,
        from: t.from ?? "",
        to: t.to ?? null,
        valueWei: raw ? BigInt(raw).toString() : "0",
        timestamp: t.blockTimeStamp ? (Number.isNaN(Number(t.blockTimeStamp)) ? Date.parse(t.blockTimeStamp) : Number(BigInt(t.blockTimeStamp)) * 1000) : undefined,
        method: input === "0x" ? "transfer" : KNOWN_SELECTORS[input.slice(0, 10).toLowerCase()] ?? input.slice(0, 10),
      });
    }
    return txs.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)).slice(0, limit);
  }

  async tokenBalances(): Promise<ExplorerTokenBalance[]> {
    return [];
  }

  async tokenInfo(address: string, options: Options): Promise<ExplorerTokenInfo | null> {
    const [meta, count] = await rpc<unknown>(
      this.url,
      [
        { method: "nr_getTokenMeta", params: [address] },
        { method: "nr_getTokenHolderCount", params: [address] },
      ],
      { ...options, vendor: VENDOR },
    );
    const m = meta as { name?: string; symbol?: string; decimals?: number } | null;
    const c = count as { result?: string } | null;
    if (!m?.symbol && !m?.name) return null;
    return { address, name: m?.name, symbol: m?.symbol, decimals: m?.decimals, holders: c?.result ? Number(BigInt(c.result)) : undefined };
  }

  async tokenHolders(address: string, limit: number, options: Options): Promise<ExplorerHolder[]> {
    const [data] = await rpc<{ details?: { accountAddress: string; tokenBalance: string }[] }>(this.url, [{ method: "nr_getTokenHolders", params: [address, "0x" + Math.min(limit, 100).toString(16), ""] }], { ...options, vendor: VENDOR });
    return (data?.details ?? []).map((h) => ({ address: h.accountAddress, raw: BigInt(h.tokenBalance || "0x0").toString() }));
  }

  async contractVerification(): Promise<ContractVerification | null> {
    return null;
  }

  async transactionDetail(): Promise<ExplorerTxDetail | null> {
    return null;
  }
}
