import { isRecoverableProviderError } from "../errors";
import { log } from "../log";

// One explorer contract for every EVM chain. Robinhood Chain speaks through
// Blockscout's unified API (free), Base and BNB Chain through Ankr (free
// plan), with Alchemy and NodeReal behind them: different vendors, same
// questions. Tools only see this interface.

export interface Options {
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface ExplorerTx {
  hash: string;
  from: string;
  to: string | null;
  /** Native value in wei, as a decimal string. */
  valueWei: string;
  timestamp?: number;
  method?: string;
  /** Vendor's one-line reading of the transaction, when it offers one. */
  summary?: string;
  failed?: boolean;
}

export interface ExplorerTokenBalance {
  address: string;
  symbol: string;
  name?: string;
  decimals: number;
  /** Raw integer balance as a decimal string. */
  raw: string;
  usd?: number;
  native?: boolean;
  possibleSpam?: boolean;
}

export interface ExplorerTokenInfo {
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  /** Raw integer supply as a decimal string. */
  totalSupply?: string;
  holders?: number;
  verified?: boolean;
  priceUsd?: number;
  possibleSpam?: boolean;
}

export interface ExplorerHolder {
  address: string;
  raw: string;
  percent?: number;
}

export interface ContractVerification {
  verified: boolean;
  name?: string;
  compiler?: string;
  proxy?: boolean;
  implementation?: string;
}

export interface ExplorerTxDetail {
  method?: string;
  params?: string;
  timestamp?: number;
  revertReason?: string;
}

export interface EvmExplorer {
  readonly vendor: string;
  recentTransactions(address: string, limit: number, options: Options): Promise<ExplorerTx[]>;
  tokenBalances(address: string, options: Options): Promise<ExplorerTokenBalance[]>;
  tokenInfo(address: string, options: Options): Promise<ExplorerTokenInfo | null>;
  tokenHolders(address: string, limit: number, options: Options): Promise<ExplorerHolder[]>;
  contractVerification(address: string, options: Options): Promise<ContractVerification | null>;
  transactionDetail(hash: string, options: Options): Promise<ExplorerTxDetail | null>;
  /** Native coin price in USD, when the vendor publishes one. */
  nativePriceUsd?(options: Options): Promise<number | undefined>;
}

const empty = (value: unknown) => value === null || value === undefined || (Array.isArray(value) && value.length === 0);

/**
 * Several explorers behind one: each question goes to the first vendor, and
 * moves to the next when that one fails in a recoverable way or has nothing.
 * The vendor that answered last is reported, so evidence names a real source.
 */
export class ExplorerChain implements EvmExplorer {
  private answered: string | null = null;

  constructor(private readonly explorers: EvmExplorer[]) {}

  get vendor(): string {
    return this.answered ?? this.explorers.map((e) => e.vendor).join(" → ");
  }

  private async ask<T>(call: (explorer: EvmExplorer) => Promise<T>, fallback: T): Promise<T> {
    let lastError: unknown = null;
    for (const explorer of this.explorers) {
      try {
        const result = await call(explorer);
        if (!empty(result)) {
          this.answered = explorer.vendor;
          return result;
        }
      } catch (error) {
        if (!isRecoverableProviderError(error)) throw error;
        lastError = error;
        log.warn("onchain.explorer_failover", { provider: explorer.vendor, detail: error instanceof Error ? error.message.slice(0, 120) : String(error) });
      }
    }
    if (lastError && this.explorers.length === 1) throw lastError;
    return fallback;
  }

  recentTransactions(address: string, limit: number, options: Options) {
    return this.ask((e) => e.recentTransactions(address, limit, options), []);
  }

  tokenBalances(address: string, options: Options) {
    return this.ask((e) => e.tokenBalances(address, options), []);
  }

  tokenInfo(address: string, options: Options) {
    return this.ask((e) => e.tokenInfo(address, options), null);
  }

  tokenHolders(address: string, limit: number, options: Options) {
    return this.ask((e) => e.tokenHolders(address, limit, options), []);
  }

  contractVerification(address: string, options: Options) {
    return this.ask((e) => e.contractVerification(address, options), null);
  }

  transactionDetail(hash: string, options: Options) {
    return this.ask((e) => e.transactionDetail(hash, options), null);
  }

  async nativePriceUsd(options: Options): Promise<number | undefined> {
    for (const explorer of this.explorers) {
      if (!explorer.nativePriceUsd) continue;
      const price = await explorer.nativePriceUsd(options).catch(() => undefined);
      if (price) return price;
    }
    return undefined;
  }
}
