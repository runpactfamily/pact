import { PactError } from "../../errors";
import type { ContractVerification, EvmExplorer, ExplorerHolder, ExplorerTokenBalance, ExplorerTokenInfo, ExplorerTx, ExplorerTxDetail, Options } from "../explorer";
import { fetchJson } from "../http";

// Blockscout's unified API (api.blockscout.com) in its Etherscan-compatible
// form: `chainid` picks the network, one free key covers the chains on the
// free tier (Robinhood Chain among them; Base is a paid "featured" chain
// there and BNB Chain is not served, so those go through Moralis).

const VENDOR = "Blockscout";

interface Envelope<T> {
  status?: string;
  message?: string;
  result?: T | string | null;
}

export class BlockscoutExplorer implements EvmExplorer {
  readonly vendor = VENDOR;

  constructor(
    private readonly apiUrl: string,
    private readonly chainId: number,
    private readonly apiKey: string,
  ) {}

  private async call<T>(params: Record<string, string>, options: Options): Promise<T | null> {
    const query = new URLSearchParams({ chainid: String(this.chainId), ...params });
    const data = await fetchJson<Envelope<T>>(`${this.apiUrl}?${query}`, { ...options, vendor: VENDOR, headers: { authorization: `Bearer ${this.apiKey}` } });
    if (data.status === "0" || data.result === null || data.result === undefined) {
      const text = (typeof data.result === "string" ? data.result : data.message) ?? "";
      if (/not found|no transactions|no records|no token/i.test(text)) return null;
      if (/rate limit/i.test(text)) throw new PactError("RATE_LIMITED", "Blockscout is rate-limiting requests right now.");
      if (text) throw new PactError("PROVIDER_UNAVAILABLE", `Blockscout: ${text.slice(0, 120)}.`);
      return null;
    }
    return data.result as T;
  }

  async recentTransactions(address: string, limit: number, options: Options): Promise<ExplorerTx[]> {
    const rows = await this.call<{ hash: string; from: string; to: string; value: string; timeStamp: string; isError?: string; functionName?: string; input?: string }[]>(
      { module: "account", action: "txlist", address, page: "1", offset: String(limit), sort: "desc" },
      options,
    );
    return (rows ?? []).map((r) => ({
      hash: r.hash,
      from: r.from,
      to: r.to || null,
      valueWei: r.value,
      timestamp: Number(r.timeStamp) * 1000,
      method: r.functionName?.split("(")[0] || (r.input && r.input !== "0x" ? r.input.slice(0, 10) : "transfer"),
      failed: r.isError === "1",
    }));
  }

  async tokenBalances(address: string, options: Options): Promise<ExplorerTokenBalance[]> {
    const rows = await this.call<{ balance: string; contractAddress: string; decimals: string; name: string; symbol: string; type: string }[]>({ module: "account", action: "tokenlist", address }, options);
    return (rows ?? []).filter((r) => r.type === "ERC-20" && r.decimals !== "").map((r) => ({ address: r.contractAddress, symbol: r.symbol || "?", name: r.name, decimals: Number(r.decimals || 18), raw: r.balance }));
  }

  async tokenInfo(address: string, options: Options): Promise<ExplorerTokenInfo | null> {
    const row = await this.call<{ contractAddress: string; decimals: string; name: string; symbol: string; totalSupply: string; type: string }>({ module: "token", action: "getToken", contractaddress: address }, options);
    if (!row) return null;
    return { address: row.contractAddress, name: row.name, symbol: row.symbol, decimals: row.decimals ? Number(row.decimals) : undefined, totalSupply: row.totalSupply };
  }

  async tokenHolders(address: string, limit: number, options: Options): Promise<ExplorerHolder[]> {
    const rows = await this.call<{ address: string; value: string }[]>({ module: "token", action: "getTokenHolders", contractaddress: address, page: "1", offset: String(limit) }, options);
    return (rows ?? []).map((r) => ({ address: r.address, raw: r.value }));
  }

  async contractVerification(address: string, options: Options): Promise<ContractVerification | null> {
    const rows = await this.call<{ SourceCode?: string; ContractName?: string; CompilerVersion?: string; Proxy?: string; Implementation?: string }[]>({ module: "contract", action: "getsourcecode", address }, options);
    const row = rows?.[0];
    if (!row) return null;
    const verified = Boolean(row.SourceCode && row.ContractName);
    return { verified, name: row.ContractName, compiler: row.CompilerVersion, proxy: row.Proxy === "1", implementation: row.Implementation || undefined };
  }

  async transactionDetail(hash: string, options: Options): Promise<ExplorerTxDetail | null> {
    const row = await this.call<{ timeStamp?: string; revertReason?: string; input?: string }>({ module: "transaction", action: "gettxinfo", txhash: hash }, options);
    if (!row) return null;
    return { timestamp: row.timeStamp ? Number(row.timeStamp) * 1000 : undefined, revertReason: row.revertReason || undefined };
  }

  async nativePriceUsd(options: Options): Promise<number | undefined> {
    const row = await this.call<{ ethusd?: string }>({ module: "stats", action: "ethprice" }, options);
    const price = Number(row?.ethusd);
    return Number.isFinite(price) && price > 0 ? price : undefined;
  }
}
