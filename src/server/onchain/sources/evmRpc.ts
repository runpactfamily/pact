import { rpc } from "../http";

// Public JSON-RPC for the EVM chains. Batched where possible: one request
// per tool call, not one per value.

interface Options {
  timeoutMs: number;
  signal?: AbortSignal;
}

const SELECTORS = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
  balanceOf: "0x70a08231",
};

export interface EvmTransaction {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  input: string;
  gas: string;
  gasPrice?: string;
  blockNumber: string | null;
  nonce: string;
}

export interface EvmReceipt {
  status: string;
  gasUsed: string;
  effectiveGasPrice?: string;
  contractAddress?: string | null;
  logs: { address: string; topics: string[]; data: string }[];
  blockNumber: string;
}

export interface Erc20Meta {
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: bigint;
}

export const hexToBigInt = (hex: string | null | undefined): bigint => (hex && hex !== "0x" ? BigInt(hex) : 0n);
const pad32 = (addr: string) => addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");

function hexToUtf8(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes).replace(/\0+$/, "");
}

/** Decodes an ABI-encoded string return (or a bytes32 one, which some old tokens use). */
export function decodeString(hex: string | null | undefined): string | undefined {
  if (!hex || hex === "0x") return undefined;
  const data = hex.slice(2);
  try {
    if (data.length === 64) return hexToUtf8(data) || undefined;
    const offset = Number(BigInt("0x" + data.slice(0, 64))) * 2;
    const length = Number(BigInt("0x" + data.slice(offset, offset + 64))) * 2;
    return hexToUtf8(data.slice(offset + 64, offset + 64 + length)) || undefined;
  } catch {
    return undefined;
  }
}

export class EvmRpc {
  constructor(
    private readonly url: string,
    readonly vendor: string,
  ) {}

  private batch<T>(calls: { method: string; params?: unknown[] }[], options: Options): Promise<T[]> {
    return rpc<T>(this.url, calls, { ...options, vendor: this.vendor });
  }

  /** Gas price (gwei) and latest block, one request. */
  async network(options: Options): Promise<{ gasGwei: number; block: number }> {
    const [gas, block] = await this.batch<string>([{ method: "eth_gasPrice" }, { method: "eth_blockNumber" }], options);
    return { gasGwei: Number(hexToBigInt(gas)) / 1e9, block: Number(hexToBigInt(block)) };
  }

  /**
   * Native balance and what kind of account this is, in one request. Since
   * EIP-7702 a wallet may carry a short delegation designator (0xef0100 + an
   * address) without being a contract.
   */
  async account(address: string, options: Options): Promise<{ balance: bigint; isContract: boolean; delegatedTo?: string }> {
    const [balance, code] = await this.batch<string>([{ method: "eth_getBalance", params: [address, "latest"] }, { method: "eth_getCode", params: [address, "latest"] }], options);
    const lower = (code ?? "0x").toLowerCase();
    const delegated = lower.startsWith("0xef0100") && lower.length === 48;
    return { balance: hexToBigInt(balance), isContract: Boolean(lower !== "0x" && !delegated), delegatedTo: delegated ? "0x" + lower.slice(8) : undefined };
  }

  /** ERC-20 metadata for several tokens in one request. A field is missing when the contract did not answer that call. */
  async erc20Many(addresses: string[], options: Options): Promise<(Erc20Meta & { isContract: boolean })[]> {
    if (!addresses.length) return [];
    const calls: { method: string; params?: unknown[] }[] = [];
    for (const address of addresses) {
      for (const data of [SELECTORS.name, SELECTORS.symbol, SELECTORS.decimals, SELECTORS.totalSupply]) calls.push({ method: "eth_call", params: [{ to: address, data }, "latest"] });
      calls.push({ method: "eth_getCode", params: [address, "latest"] });
    }
    // A failing eth_call (non-token contract) must not sink the batch: ask individually when the batch rejects.
    let results: (string | null)[];
    try {
      results = await this.batch<string | null>(calls, options);
    } catch {
      results = await Promise.all(calls.map((c) => this.batch<string | null>([c], options).then((r) => r[0]).catch(() => null)));
    }
    return addresses.map((address, i) => {
      const [name, symbol, decimals, totalSupply, code] = results.slice(i * 5, i * 5 + 5);
      return {
        address,
        name: decodeString(name),
        symbol: decodeString(symbol),
        decimals: decimals && decimals !== "0x" ? Number(hexToBigInt(decimals)) : undefined,
        totalSupply: totalSupply && totalSupply !== "0x" ? hexToBigInt(totalSupply) : undefined,
        isContract: Boolean(code && code !== "0x"),
      };
    });
  }

  async erc20(address: string, options: Options): Promise<Erc20Meta & { isContract: boolean }> {
    const [meta] = await this.erc20Many([address], options);
    return meta;
  }

  /** Balances of several ERC-20 tokens for one holder, one request. */
  async erc20Balances(holder: string, tokens: string[], options: Options): Promise<bigint[]> {
    if (!tokens.length) return [];
    const calls = tokens.map((token) => ({ method: "eth_call", params: [{ to: token, data: SELECTORS.balanceOf + pad32(holder) }, "latest"] }));
    const results = await this.batch<string>(calls, options);
    return results.map((r) => hexToBigInt(r));
  }

  async transaction(hash: string, options: Options): Promise<{ tx: EvmTransaction | null; receipt: EvmReceipt | null }> {
    const [tx, receipt] = await this.batch<EvmTransaction | EvmReceipt | null>([{ method: "eth_getTransactionByHash", params: [hash] }, { method: "eth_getTransactionReceipt", params: [hash] }], options);
    return { tx: (tx as EvmTransaction | null) ?? null, receipt: (receipt as EvmReceipt | null) ?? null };
  }
}

/** ERC-20 Transfer(address,address,uint256) topic. */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export function topicToAddress(topic: string): string {
  return "0x" + topic.slice(-40);
}

/** Well-known 4-byte selectors, for a readable method name when no explorer decodes the call. */
export const KNOWN_SELECTORS: Record<string, string> = {
  "0xa9059cbb": "transfer",
  "0x095ea7b3": "approve",
  "0x23b872dd": "transferFrom",
  "0x38ed1739": "swapExactTokensForTokens",
  "0x7ff36ab5": "swapExactETHForTokens",
  "0x18cbafe5": "swapExactTokensForETH",
  "0x5ae401dc": "multicall",
  "0xac9650d8": "multicall",
  "0x3593564c": "execute (Universal Router)",
  "0x04e45aaf": "exactInputSingle",
  "0xb6f9de95": "swapExactETHForTokensSupportingFeeOnTransferTokens",
  "0x791ac947": "swapExactTokensForETHSupportingFeeOnTransferTokens",
  "0xd0e30db0": "deposit",
  "0x2e1a7d4d": "withdraw",
  "0x40c10f19": "mint",
  "0x42966c68": "burn",
  "0xa22cb465": "setApprovalForAll",
  "0xe8e33700": "addLiquidity",
  "0xf305d719": "addLiquidityETH",
  "0xbaa2abde": "removeLiquidity",
  "0x02751cec": "removeLiquidityETH",
  "0x12aa3caf": "swap (1inch)",
  "0x0162e2d0": "swap",
};
