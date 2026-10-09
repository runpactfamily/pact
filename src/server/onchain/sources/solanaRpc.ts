import { rpc } from "../http";

// Solana JSON-RPC. With a Helius key the same endpoint also answers the DAS
// methods (token metadata and priced wallet holdings); without one, the
// public RPC covers balances, token accounts, signatures and transactions.

interface Options {
  timeoutMs: number;
  signal?: AbortSignal;
}

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export interface SolTokenAccount {
  mint: string;
  amount: number;
  decimals: number;
}

export interface SolSignature {
  signature: string;
  slot?: number;
  blockTime?: number | null;
  err?: unknown;
  memo?: string | null;
}

export interface SolParsedTransaction {
  slot?: number;
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    fee?: number;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { uiAmount: number | null; decimals: number } }[];
    postTokenBalances?: { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { uiAmount: number | null; decimals: number } }[];
    logMessages?: string[];
  };
  transaction?: {
    message?: {
      accountKeys?: { pubkey: string; signer?: boolean; writable?: boolean }[];
      instructions?: { program?: string; programId?: string; parsed?: { type?: string; info?: Record<string, unknown> } }[];
    };
    signatures?: string[];
  };
}

export interface SolMint {
  decimals: number;
  supply: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
}

export interface DasAsset {
  id: string;
  interface?: string;
  content?: { metadata?: { name?: string; symbol?: string; description?: string }; links?: { image?: string } };
  token_info?: { symbol?: string; supply?: number; decimals?: number; balance?: number; price_info?: { price_per_token?: number; total_price?: number; currency?: string }; mint_authority?: string | null; freeze_authority?: string | null };
}

type ParsedTokenAccount = { account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null; decimals: number } } } } } };

export class SolanaRpc {
  constructor(
    private readonly url: string,
    readonly hasDas: boolean,
  ) {}

  private get vendor() {
    return this.hasDas ? "Helius" : "Solana RPC";
  }

  private call<T>(method: string, params: unknown[] | Record<string, unknown>, options: Options): Promise<T> {
    // DAS methods take a named-parameter object; classic RPC methods take an array. Both go through as-is.
    return rpc<T>(this.url, [{ method, params }], { ...options, vendor: this.vendor }).then((r) => r[0]);
  }

  async balance(address: string, options: Options): Promise<number> {
    const data = await this.call<{ value: number }>("getBalance", [address], options);
    return data.value / 1e9;
  }

  /** SPL and Token-2022 holdings with a non-zero balance, one request. */
  async tokenAccounts(owner: string, options: Options): Promise<SolTokenAccount[]> {
    const results = await rpc<{ value?: ParsedTokenAccount[] }>(
      this.url,
      [TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map((programId) => ({ method: "getTokenAccountsByOwner", params: [owner, { programId }, { encoding: "jsonParsed" }] })),
      { ...options, vendor: this.vendor },
    );
    const out: SolTokenAccount[] = [];
    for (const data of results) {
      for (const item of data.value ?? []) {
        const info = item.account.data.parsed.info;
        if ((info.tokenAmount.uiAmount ?? 0) > 0) out.push({ mint: info.mint, amount: info.tokenAmount.uiAmount ?? 0, decimals: info.tokenAmount.decimals });
      }
    }
    return out;
  }

  signatures(address: string, limit: number, options: Options): Promise<SolSignature[]> {
    return this.call<SolSignature[]>("getSignaturesForAddress", [address, { limit }], options);
  }

  transaction(signature: string, options: Options): Promise<SolParsedTransaction | null> {
    return this.call<SolParsedTransaction | null>("getTransaction", [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }], options);
  }

  /** Mint account plus its largest holders, one request. */
  async mintWithHolders(address: string, options: Options): Promise<{ mint: SolMint | null; largest: { address: string; uiAmount: number | null }[] }> {
    const [info, largest] = await rpc<unknown>(
      this.url,
      [
        { method: "getAccountInfo", params: [address, { encoding: "jsonParsed" }] },
        { method: "getTokenLargestAccounts", params: [address] },
      ],
      { ...options, vendor: this.vendor },
    );
    const parsed = (info as { value?: { data?: { parsed?: { type?: string; info?: { decimals: number; supply: string; mintAuthority: string | null; freezeAuthority: string | null } } } } | null })?.value?.data?.parsed;
    const mint = parsed?.type === "mint" && parsed.info ? { decimals: parsed.info.decimals, supply: parsed.info.supply, mintAuthority: parsed.info.mintAuthority, freezeAuthority: parsed.info.freezeAuthority } : null;
    const accounts = (largest as { value?: { address: string; uiAmount: number | null }[] } | null)?.value ?? [];
    return { mint, largest: accounts };
  }

  /** DAS (Helius only): token metadata with a price when known. */
  asset(mint: string, options: Options): Promise<DasAsset | null> {
    return this.call<DasAsset | null>("getAsset", { id: mint }, options);
  }

  /** DAS (Helius only): fungible holdings with prices and the native balance. */
  async assetsByOwner(owner: string, options: Options): Promise<{ items: DasAsset[]; nativeBalance?: { lamports?: number; price_per_sol?: number; total_price?: number } }> {
    const data = await this.call<{ items?: DasAsset[]; nativeBalance?: { lamports?: number; price_per_sol?: number; total_price?: number } }>(
      "getAssetsByOwner",
      { ownerAddress: owner, page: 1, limit: 100, displayOptions: { showFungible: true, showNativeBalance: true, showZeroBalance: false } },
      options,
    );
    return { items: (data.items ?? []).filter((a) => a.interface === "FungibleToken" || a.interface === "FungibleAsset"), nativeBalance: data.nativeBalance };
  }
}
