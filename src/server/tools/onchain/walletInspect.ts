import { PactError } from "../../errors";
import { explorerLink } from "../../onchain/chains";
import { ago, fmtNum, fmtUsd, fromUnits, shortAddr } from "../../onchain/format";
import { currentPrices } from "../../onchain/sources/defillama";
import { addressFlags, addressSecurity } from "../../onchain/sources/goplus";
import type { Tool } from "../types";
import { CHAIN_PROPERTY, evidence, isAddressFor, requireChain, sourceOptions } from "./shared";

interface Input {
  chain: string;
  address: string;
  limit?: number;
}

interface Output {
  chain: string;
  address: string;
  isContract?: boolean;
  nativeBalance: number;
  nativeUsd?: number;
  tokens: { symbol: string; amount: number; usd?: number; address?: string }[];
  transactions: number;
  lastActivity?: number;
  flags?: string[];
}

const NATIVE_PRICE_KEY: Record<string, string> = { ETH: "coingecko:ethereum", BNB: "coingecko:binancecoin", SOL: "coingecko:solana" };

export const walletInspectTool: Tool<Input, Output> = {
  name: "wallet_inspect",
  description: "What an address holds and has been doing: native and token balances, recent transactions with methods and counterparties, whether it is a contract.",
  stage: "researching",
  inputSchema: { type: "object", properties: { chain: CHAIN_PROPERTY, address: { type: "string" }, limit: { type: "number", description: "recent transactions, 1–25 (default 12)" } }, required: ["chain", "address"] },
  outputSchema: { type: "object", properties: { nativeBalance: { type: "number" }, tokens: { type: "array", items: { type: "object" } }, transactions: { type: "number" } } },
  isAvailable: () => ({ available: true }),
  async execute(input, context) {
    const { info, clients } = requireChain(input.chain);
    const address = input.address.trim();
    if (!isAddressFor(info, address)) throw new PactError("INVALID_REQUEST", `${address.slice(0, 12)}… is not a valid ${info.name} address.`);
    const options = sourceOptions(context);
    const limit = Math.min(25, Math.max(1, Math.floor(input.limit ?? 12)));
    const lines: string[] = [];
    const providers: string[] = [];
    const out: Output = { chain: info.id, address, nativeBalance: 0, tokens: [], transactions: 0 };

    if (clients.evm) {
      const priceKey = NATIVE_PRICE_KEY[info.nativeSymbol];
      const [account, prices] = await Promise.all([clients.evm.account(address, options), priceKey ? currentPrices([priceKey], options).catch(() => ({})) : Promise.resolve({})]);
      providers.push(clients.evm.vendor);
      const nativePrice = (prices as Record<string, { price: number }>)[priceKey]?.price;
      out.isContract = account.isContract;
      out.nativeBalance = fromUnits(account.balance, info.nativeDecimals);
      out.nativeUsd = nativePrice ? out.nativeBalance * nativePrice : undefined;
      lines.push(`${address} on ${info.name}: ${account.isContract ? "CONTRACT" : account.delegatedTo ? `wallet (EIP-7702 delegation to ${shortAddr(account.delegatedTo)})` : "wallet (externally owned)"} · ${fmtNum(out.nativeBalance, 4)} ${info.nativeSymbol}${out.nativeUsd !== undefined ? ` (${fmtUsd(out.nativeUsd)})` : ""}`);

      if (clients.explorer) {
        const [txs, balances] = await Promise.all([clients.explorer.recentTransactions(address, limit, options), clients.explorer.tokenBalances(address, options)]);
        providers.push(clients.explorer.vendor);
        out.transactions = txs.length;
        out.lastActivity = txs[0]?.timestamp;
        out.tokens = balances
          .filter((b) => !b.native && !b.possibleSpam)
          .map((b) => ({ symbol: b.symbol, amount: fromUnits(b.raw, b.decimals), usd: b.usd, address: b.address }))
          .filter((t) => t.amount > 0)
          .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0) || b.amount - a.amount);
        const priced = out.tokens.filter((t) => t.usd !== undefined);
        lines.push(out.tokens.length ? `Token balances (${out.tokens.length}${priced.length ? `, ${fmtUsd(priced.reduce((s, t) => s + (t.usd ?? 0), 0))} priced` : ""}): ${out.tokens.slice(0, 12).map((t) => `${fmtNum(t.amount)} ${t.symbol}${t.usd !== undefined ? ` (${fmtUsd(t.usd)})` : ""}`).join(", ")}` : "No token balances.");
        lines.push(`Recent transactions (${txs.length}, newest first):`);
        for (const tx of txs) {
          const direction = tx.from.toLowerCase() === address.toLowerCase() ? "out" : "in";
          const counter = direction === "out" ? tx.to : tx.from;
          lines.push(`- ${tx.timestamp ? ago(tx.timestamp) : "?"} · ${tx.summary ?? tx.method ?? "call"} · ${direction} · ${fmtNum(fromUnits(tx.valueWei, info.nativeDecimals), 4)} ${info.nativeSymbol} · with ${counter ? shortAddr(counter) : "contract creation"}${tx.failed ? " · FAILED" : ""} · ${tx.hash}`);
        }
      } else {
        lines.push(`Transaction history and token balances are unavailable: no explorer key is configured for ${info.name}.`);
      }
    } else if (clients.solana) {
      if (clients.solana.hasDas) {
        const [holdings, sigs] = await Promise.all([clients.solana.assetsByOwner(address, options), clients.solana.signatures(address, limit, options)]);
        providers.push("Helius");
        out.nativeBalance = (holdings.nativeBalance?.lamports ?? 0) / 1e9;
        out.nativeUsd = holdings.nativeBalance?.total_price;
        out.tokens = holdings.items
          .map((a) => ({ symbol: a.token_info?.symbol ?? a.content?.metadata?.symbol ?? "?", amount: a.token_info?.balance !== undefined && a.token_info.decimals !== undefined ? a.token_info.balance / 10 ** a.token_info.decimals : 0, usd: a.token_info?.price_info?.total_price, address: a.id }))
          .filter((t) => t.amount > 0)
          .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
        out.transactions = sigs.length;
        out.lastActivity = sigs[0]?.blockTime ? sigs[0].blockTime * 1000 : undefined;
        lines.push(`${address} on Solana: ${fmtNum(out.nativeBalance, 4)} SOL${out.nativeUsd !== undefined ? ` (${fmtUsd(out.nativeUsd)})` : ""} · ${out.tokens.length} fungible tokens${out.tokens.length ? `, total ${fmtUsd(out.tokens.reduce((s, t) => s + (t.usd ?? 0), 0))} priced` : ""}`);
        lines.push(out.tokens.length ? `Holdings: ${out.tokens.slice(0, 15).map((t) => `${fmtNum(t.amount)} ${t.symbol}${t.usd !== undefined ? ` (${fmtUsd(t.usd)})` : ""}`).join(", ")}` : "No token holdings.");
        lines.push(`Recent signatures (${sigs.length}, newest first): ${sigs.map((s) => `${s.blockTime ? ago(s.blockTime * 1000) : "?"}${s.err ? " FAILED" : ""} ${s.signature}`).join(" · ")}`);
      } else {
        const [balance, accounts, sigs] = await Promise.all([clients.solana.balance(address, options), clients.solana.tokenAccounts(address, options), clients.solana.signatures(address, limit, options)]);
        providers.push("Solana RPC");
        out.nativeBalance = balance;
        out.tokens = accounts.map((a) => ({ symbol: shortAddr(a.mint), amount: a.amount, address: a.mint })).sort((a, b) => b.amount - a.amount);
        out.transactions = sigs.length;
        out.lastActivity = sigs[0]?.blockTime ? sigs[0].blockTime * 1000 : undefined;
        lines.push(`${address} on Solana: ${fmtNum(balance, 4)} SOL · ${accounts.length} token accounts with balance (symbols need token_lookup; no metadata service configured)`);
        lines.push(out.tokens.length ? `Holdings by mint: ${out.tokens.slice(0, 15).map((t) => `${fmtNum(t.amount)} of ${t.address}`).join(", ")}` : "No token holdings.");
        lines.push(`Recent signatures (${sigs.length}, newest first): ${sigs.map((s) => `${s.blockTime ? ago(s.blockTime * 1000) : "?"}${s.err ? " FAILED" : ""} ${s.signature}`).join(" · ")}`);
      }
    }

    // Reputation: GoPlus malicious-address database, one request, keyless.
    const report = await addressSecurity(address, info.goplus, options).catch(() => null);
    if (report) {
      providers.push("GoPlus");
      out.flags = addressFlags(report);
      lines.push(out.flags.length ? `Reputation: FLAGGED by GoPlus — ${out.flags.join(", ")}` : "Reputation: not in GoPlus's malicious-address database.");
    }

    return {
      data: out,
      summary: `${shortAddr(address)} on ${info.name}: ${fmtNum(out.nativeBalance, 4)} ${info.nativeSymbol}, ${out.tokens.length} ${out.tokens.length === 1 ? "token" : "tokens"}, ${out.transactions} recent ${out.transactions === 1 ? "transaction" : "transactions"}${out.lastActivity ? `, last ${ago(out.lastActivity)}` : ""}${out.flags?.length ? `, FLAGGED: ${out.flags[0]}` : ""}`,
      evidence: [evidence(info, `Wallet ${shortAddr(address)}`, lines.join("\n"), providers.join(" + "), explorerLink(info, "address", address))],
    };
  },
};
