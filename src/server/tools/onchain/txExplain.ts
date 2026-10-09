import { PactError } from "../../errors";
import { explorerLink, isEvmTxHash, isSolanaSignature } from "../../onchain/chains";
import { ago, fmtNum, fromUnits, shortAddr } from "../../onchain/format";
import { hexToBigInt, KNOWN_SELECTORS, topicToAddress, TRANSFER_TOPIC } from "../../onchain/sources/evmRpc";
import type { Tool } from "../types";
import { CHAIN_PROPERTY, evidence, requireChain, sourceOptions } from "./shared";

interface Input {
  chain: string;
  hash: string;
}

interface Output {
  chain: string;
  hash: string;
  status: "success" | "failed" | "pending";
  from?: string;
  to?: string;
  method?: string;
  valueNative: number;
  feeNative?: number;
  transfers: number;
  timestamp?: number;
}

export const txExplainTool: Tool<Input, Output> = {
  name: "tx_explain",
  description: "Explain one transaction: status, parties, method, native value, fee, and the token transfers it caused.",
  stage: "analyzing",
  inputSchema: { type: "object", properties: { chain: CHAIN_PROPERTY, hash: { type: "string", description: "transaction hash or Solana signature" } }, required: ["chain", "hash"] },
  outputSchema: { type: "object", properties: { status: { type: "string" }, transfers: { type: "number" } } },
  isAvailable: () => ({ available: true }),
  async execute(input, context) {
    const { info, clients } = requireChain(input.chain);
    const hash = input.hash.trim();
    const options = sourceOptions(context);
    const lines: string[] = [];
    const providers: string[] = [];

    if (clients.evm) {
      if (!isEvmTxHash(hash)) throw new PactError("INVALID_REQUEST", "That is not an EVM transaction hash (0x + 64 hex characters).");
      const { tx, receipt } = await clients.evm.transaction(hash, options);
      if (!tx) throw new PactError("NOT_FOUND", `Transaction ${hash.slice(0, 12)}… is not known on ${info.name}.`);
      providers.push(clients.evm.vendor);
      const status: Output["status"] = !receipt ? "pending" : receipt.status === "0x1" ? "success" : "failed";
      const selector = tx.input.slice(0, 10).toLowerCase();
      let method = tx.input === "0x" ? "native transfer" : KNOWN_SELECTORS[selector] ?? selector;
      const out: Output = { chain: info.id, hash, status, from: tx.from, to: tx.to ?? undefined, method, valueNative: fromUnits(hexToBigInt(tx.value), info.nativeDecimals), transfers: 0 };
      if (receipt) {
        const gasUsed = hexToBigInt(receipt.gasUsed);
        const price = hexToBigInt(receipt.effectiveGasPrice ?? tx.gasPrice);
        out.feeNative = fromUnits(gasUsed * price, info.nativeDecimals);
      }

      // Decoded call, timestamp and revert reason from the explorer, when one is configured.
      let decodedParams = "";
      if (clients.explorer) {
        const detail = await clients.explorer.transactionDetail(hash, options).catch(() => null);
        if (detail) {
          providers.push(clients.explorer.vendor);
          if (detail.method) {
            method = detail.method.split("(")[0];
            out.method = method;
          }
          decodedParams = detail.params ?? "";
          out.timestamp = detail.timestamp;
          if (detail.revertReason) lines.push(`Revert reason: ${detail.revertReason.slice(0, 200)}`);
        }
      }

      // ERC-20 transfers from the logs, with symbols from one metadata batch.
      const transferLogs = (receipt?.logs ?? []).filter((l) => l.topics[0] === TRANSFER_TOPIC && l.topics.length === 3);
      const tokenAddresses = [...new Set(transferLogs.map((l) => l.address.toLowerCase()))].slice(0, 6);
      const metas = tokenAddresses.length ? await clients.evm.erc20Many(tokenAddresses, options).catch(() => []) : [];
      const metaOf = (addr: string) => metas.find((m) => m.address.toLowerCase() === addr.toLowerCase());
      out.transfers = transferLogs.length;

      lines.unshift(`Transaction ${hash} on ${info.name}: ${status.toUpperCase()}${out.timestamp ? ` · ${ago(out.timestamp)}` : ""}${receipt ? ` · block ${Number(hexToBigInt(receipt.blockNumber))}` : ""}`);
      lines.push(`From ${tx.from} to ${tx.to ?? `(contract creation${receipt?.contractAddress ? `: ${receipt.contractAddress}` : ""})`} · method ${method}${decodedParams ? ` (${decodedParams})` : ""}`);
      lines.push(`Value ${fmtNum(out.valueNative, 6)} ${info.nativeSymbol} · fee ${out.feeNative !== undefined ? `${fmtNum(out.feeNative, 6)} ${info.nativeSymbol}` : "pending"}${receipt ? ` · gas used ${Number(hexToBigInt(receipt.gasUsed))}` : ""}`);
      if (transferLogs.length) {
        lines.push(`Token transfers (${transferLogs.length}):`);
        for (const l of transferLogs.slice(0, 12)) {
          const meta = metaOf(l.address);
          const amount = fromUnits(hexToBigInt(l.data), meta?.decimals ?? 18);
          lines.push(`- ${fmtNum(amount)} ${meta?.symbol ?? shortAddr(l.address)} from ${shortAddr(topicToAddress(l.topics[1]))} to ${shortAddr(topicToAddress(l.topics[2]))}`);
        }
      } else if (receipt) {
        lines.push(`No token transfers; ${receipt.logs.length} log${receipt.logs.length === 1 ? "" : "s"} emitted.`);
      }
      return { data: out, summary: `${status} · ${method} · ${fmtNum(out.valueNative, 4)} ${info.nativeSymbol} · ${out.transfers} token ${out.transfers === 1 ? "transfer" : "transfers"}`, evidence: [evidence(info, `Transaction ${hash.slice(0, 10)}…`, lines.join("\n"), providers.join(" + "), explorerLink(info, "tx", hash))] };
    }

    if (!clients.solana) throw new PactError("INVALID_REQUEST", "Unsupported chain.");
    if (!isSolanaSignature(hash)) throw new PactError("INVALID_REQUEST", "That is not a Solana transaction signature.");
    const tx = await clients.solana.transaction(hash, options);
    if (!tx) throw new PactError("NOT_FOUND", `Signature ${hash.slice(0, 12)}… is not known on Solana (or is older than the RPC keeps).`);
    providers.push(clients.solana.hasDas ? "Helius" : "Solana RPC");
    const keys = tx.transaction?.message?.accountKeys ?? [];
    const signer = keys.find((k) => k.signer)?.pubkey;
    const status: Output["status"] = tx.meta?.err ? "failed" : "success";
    const fee = (tx.meta?.fee ?? 0) / 1e9;
    const instructions = (tx.transaction?.message?.instructions ?? []).map((i) => (i.parsed?.type ? `${i.program ?? "program"}:${i.parsed.type}` : i.program ?? (i.programId ? shortAddr(i.programId) : "unknown")));
    const method = instructions[0] ?? "unknown";
    const signerIndex = keys.findIndex((k) => k.signer);
    const solDelta = signerIndex >= 0 && tx.meta?.preBalances && tx.meta.postBalances ? (tx.meta.postBalances[signerIndex] - tx.meta.preBalances[signerIndex]) / 1e9 : 0;
    const tokenDeltas: string[] = [];
    const pre = new Map((tx.meta?.preTokenBalances ?? []).map((b) => [`${b.accountIndex}`, b]));
    for (const post of tx.meta?.postTokenBalances ?? []) {
      const before = pre.get(`${post.accountIndex}`);
      const delta = (post.uiTokenAmount.uiAmount ?? 0) - (before?.uiTokenAmount.uiAmount ?? 0);
      if (Math.abs(delta) > 0) tokenDeltas.push(`${delta > 0 ? "+" : ""}${fmtNum(delta)} of ${shortAddr(post.mint)}${post.owner ? ` (owner ${shortAddr(post.owner)})` : ""}`);
    }
    const out: Output = { chain: "solana", hash, status, from: signer, method, valueNative: Math.abs(solDelta), feeNative: fee, transfers: tokenDeltas.length, timestamp: tx.blockTime ? tx.blockTime * 1000 : undefined };
    lines.push(`Signature ${hash} on Solana: ${status.toUpperCase()}${tx.blockTime ? ` · ${ago(tx.blockTime * 1000)}` : ""} · slot ${tx.slot ?? "?"}`);
    lines.push(`Signer ${signer ?? "?"} · fee ${fmtNum(fee, 6)} SOL · signer SOL change ${solDelta >= 0 ? "+" : ""}${fmtNum(solDelta, 6)} SOL`);
    lines.push(`Instructions (${instructions.length}): ${instructions.slice(0, 10).join(" → ")}`);
    lines.push(tokenDeltas.length ? `Token balance changes: ${tokenDeltas.slice(0, 10).join("; ")}` : "No token balance changes.");
    if (tx.meta?.err) lines.push(`Error: ${JSON.stringify(tx.meta.err).slice(0, 200)}`);
    const logs = (tx.meta?.logMessages ?? []).filter((l) => /error|failed|insufficient/i.test(l)).slice(0, 3);
    if (logs.length) lines.push(`Log notes: ${logs.join(" | ").slice(0, 300)}`);
    return { data: out, summary: `${status} · ${method} · fee ${fmtNum(fee, 6)} SOL · ${tokenDeltas.length} token ${tokenDeltas.length === 1 ? "change" : "changes"}`, evidence: [evidence(info, `Transaction ${hash.slice(0, 10)}…`, lines.join("\n"), providers.join(" + "), explorerLink(info, "tx", hash))] };
  },
};
