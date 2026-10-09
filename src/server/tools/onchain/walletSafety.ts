import { PactError } from "../../errors";
import { explorerLink } from "../../onchain/chains";
import { ago, shortAddr } from "../../onchain/format";
import { addressFlags, addressSecurity, tokenApprovals } from "../../onchain/sources/goplus";
import type { Tool } from "../types";
import { CHAIN_PROPERTY, evidence, isAddressFor, requireChain, sourceOptions } from "./shared";

interface Input {
  chain: string;
  address: string;
}

interface Output {
  chain: string;
  address: string;
  flags: string[];
  approvals?: number;
  riskyApprovals?: { token: string; spender: string; reasons: string[]; unlimited: boolean; at?: number }[];
  checks: string[];
}

const UNLIMITED = /^(115792089237316195423570985008687907853269984665640564039457584007913129639935|0xf{64}|unlimited)$/i;

export const walletSafetyTool: Tool<Input, Output> = {
  name: "wallet_safety",
  description: "Is an address itself risky, and is a wallet exposed? Malicious-address database flags (phishing, scams, sanctions, mixers) and, on Base and BNB Chain, the token approvals the wallet has granted with the risk of each spender.",
  stage: "analyzing",
  inputSchema: { type: "object", properties: { chain: CHAIN_PROPERTY, address: { type: "string" } }, required: ["chain", "address"] },
  outputSchema: { type: "object", properties: { flags: { type: "array", items: { type: "string" } }, approvals: { type: "number" } } },
  isAvailable: () => ({ available: true }),
  async execute(input, context) {
    const { info } = requireChain(input.chain);
    const address = input.address.trim();
    if (!isAddressFor(info, address)) throw new PactError("INVALID_REQUEST", `${address.slice(0, 12)}… is not a valid ${info.name} address.`);
    const options = sourceOptions(context);
    const out: Output = { chain: info.id, address, flags: [], checks: [] };
    const lines: string[] = [];

    const report = await addressSecurity(address, info.goplus, options).catch(() => null);
    if (report) {
      out.checks.push("malicious address database");
      out.flags = addressFlags(report);
      lines.push(out.flags.length ? `GoPlus address check for ${address}: FLAGGED — ${out.flags.join(", ")}${report.data_source ? ` (source: ${report.data_source})` : ""}` : `GoPlus address check for ${address}: not in the malicious-address database (no phishing, scam, sanctions, mixer or hacker labels).`);
      if (report.contract_address === "1") lines.push("The address is a contract.");
    } else {
      lines.push("GoPlus address database did not answer for this address.");
    }

    if (info.family === "evm" && info.goplus) {
      const approvals = await tokenApprovals(info.goplus, address, options).catch(() => null);
      if (approvals) {
        out.checks.push("token approvals");
        const risky: NonNullable<Output["riskyApprovals"]> = [];
        let total = 0;
        for (const token of approvals) {
          for (const a of token.approved_list ?? []) {
            total++;
            const spender = a.address_info ?? undefined;
            const reasons: string[] = [];
            if (token.malicious_address === 1) reasons.push("the token itself is flagged malicious");
            if (spender?.malicious_address === 1) reasons.push("spender is a known malicious address");
            if (spender?.doubt_list === 1) reasons.push("spender is on a doubt list");
            if (spender?.malicious_behavior?.length) reasons.push(`behaviour: ${spender.malicious_behavior.join(", ")}`);
            if (spender?.is_contract === 1 && spender.is_open_source === 0) reasons.push("spender contract is not open source");
            if (spender?.is_contract === 0) reasons.push("spender is an externally owned account, not a contract");
            const unlimited = UNLIMITED.test(a.approved_amount ?? "");
            const known = Boolean(spender?.tag || spender?.contract_name || spender?.trust_list === 1);
            if (reasons.length || (unlimited && !known)) risky.push({ token: token.token_symbol ?? token.token_address ?? "?", spender: a.approved_contract ?? "?", reasons: reasons.length ? reasons : ["unlimited approval to an unlabelled spender"], unlimited, at: a.approved_time ? a.approved_time * 1000 : undefined });
          }
        }
        out.approvals = total;
        out.riskyApprovals = risky;
        lines.push(`Token approvals granted by this wallet on ${info.name}: ${total} across ${approvals.length} tokens; ${risky.length} worth revoking.`);
        for (const r of risky.slice(0, 10)) lines.push(`- ${r.token} → ${shortAddr(r.spender)}${r.unlimited ? " (unlimited)" : ""}${r.at ? ` · ${ago(r.at)}` : ""}: ${r.reasons.join("; ")}`);
        const labelled = approvals.flatMap((t) => (t.approved_list ?? []).map((a) => a.address_info?.tag || a.address_info?.contract_name).filter((x): x is string => Boolean(x))).slice(0, 8);
        if (labelled.length) lines.push(`Known spenders: ${[...new Set(labelled)].join(", ")}`);
      } else {
        lines.push("Approval check did not answer for this wallet.");
      }
    } else if (info.family === "evm") {
      lines.push(`Approval checks are not available on ${info.name} yet.`);
    } else {
      lines.push("Solana has no ERC-20 style approvals; token delegates are not screened here.");
    }
    lines.push(`Checks performed: ${out.checks.join(", ") || "none"}. Absence from a database is not proof of safety.`);

    const riskyCount = out.riskyApprovals?.length ?? 0;
    return {
      data: out,
      summary: out.flags.length ? `${shortAddr(address)}: FLAGGED (${out.flags.slice(0, 2).join(", ")})${out.approvals !== undefined ? `, ${riskyCount} risky approvals` : ""}` : `${shortAddr(address)}: no malicious-address flags${out.approvals !== undefined ? `, ${out.approvals} approvals, ${riskyCount} worth revoking` : ""}`,
      evidence: [evidence(info, `Safety of ${shortAddr(address)}`, lines.join("\n"), "GoPlus", explorerLink(info, "address", address))],
    };
  },
};
