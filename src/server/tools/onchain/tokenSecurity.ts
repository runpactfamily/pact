import { PactError } from "../../errors";
import { fmtNum, fromUnits, shortAddr } from "../../onchain/format";
import { tokenInfoExtended } from "../../onchain/sources/geckoterminal";
import { evmRiskFlags, evmTokenSecurity, solanaRiskFlags, solanaTokenSecurity } from "../../onchain/sources/goplus";
import { tokenByMint } from "../../onchain/sources/jupiter";
import type { Tool } from "../types";
import { CHAIN_PROPERTY, evidence, requireChain, resolveToken, sourceOptions, tokenLink } from "./shared";

interface Input {
  chain: string;
  token: string;
}

interface Output {
  chain: string;
  address: string;
  symbol?: string;
  severe: string[];
  warnings: string[];
  verified?: boolean;
  holders?: number;
  topHoldersPct?: number;
  checks: string[];
}

export const tokenSecurityTool: Tool<Input, Output> = {
  name: "token_security",
  description: "Risk checks for a token contract or mint: honeypot/tax, mint and freeze authority, ownership, verification, holder concentration, liquidity locks.",
  stage: "analyzing",
  inputSchema: {
    type: "object",
    properties: { chain: CHAIN_PROPERTY, token: { type: "string", description: "Symbol or contract/mint address" } },
    required: ["chain", "token"],
  },
  outputSchema: { type: "object", properties: { severe: { type: "array", items: { type: "string" } }, warnings: { type: "array", items: { type: "string" } } } },
  isAvailable: () => ({ available: true }),
  async execute(input, context) {
    const { info, clients } = requireChain(input.chain);
    const options = sourceOptions(context);
    const resolved = await resolveToken(info, clients, input.token, options);
    const { address } = resolved;
    const out: Output = { chain: info.id, address, symbol: resolved.symbol, severe: [], warnings: [], checks: [] };
    const lines: string[] = [];
    const providers: string[] = [];

    if (info.family === "evm") {
      if (info.goplus) {
        const report = (await evmTokenSecurity(info.goplus, [address], options))[address.toLowerCase()];
        if (!report) {
          lines.push(`GoPlus has no report for ${address} on ${info.name} (the token may be too new or not a standard token).`);
        } else {
          providers.push("GoPlus");
          const flags = evmRiskFlags(report);
          out.severe = flags.severe;
          out.warnings = flags.warnings;
          out.symbol ??= report.token_symbol;
          out.verified = report.is_open_source === "1";
          out.holders = report.holder_count ? Number(report.holder_count) : undefined;
          const top = (report.holders ?? []).filter((h) => !h.is_contract).slice(0, 10).reduce((s, h) => s + Number(h.percent ?? 0) * 100, 0);
          out.topHoldersPct = top ? Number(top.toFixed(1)) : undefined;
          out.checks.push("honeypot", "tax", "mintable", "proxy", "ownership", "blacklist", "pausable", "holders", "liquidity locks");
          lines.push(`GoPlus report for ${report.token_name ?? "?"} (${report.token_symbol ?? "?"}) at ${address}:`);
          lines.push(`Honeypot ${report.is_honeypot === "1" ? "YES" : "no"} · buy tax ${(Number(report.buy_tax ?? 0) * 100).toFixed(1)}% · sell tax ${(Number(report.sell_tax ?? 0) * 100).toFixed(1)}% · source verified ${report.is_open_source === "1" ? "yes" : "no"} · proxy ${report.is_proxy === "1" ? "yes" : "no"} · mintable ${report.is_mintable === "1" ? "yes" : "no"}`);
          lines.push(`Owner ${report.owner_address ? shortAddr(report.owner_address) : "renounced/none"} (${(Number(report.owner_percent ?? 0) * 100).toFixed(1)}% of supply) · creator ${report.creator_address ? shortAddr(report.creator_address) : "?"} (${(Number(report.creator_percent ?? 0) * 100).toFixed(1)}%) · holders ${out.holders !== undefined ? fmtNum(out.holders) : "n/a"} · top 10 wallets ${out.topHoldersPct ?? "n/a"}%`);
          const lp = report.lp_holders ?? [];
          if (lp.length) {
            const locked = lp.filter((h) => h.is_locked === 1).reduce((s, h) => s + Number(h.percent ?? 0) * 100, 0);
            lines.push(`Liquidity: ${report.is_in_dex === "1" ? "listed on a DEX" : "not on a DEX"} · ${lp.length} LP holders · ${locked.toFixed(0)}% of LP locked or burned${report.dex?.length ? ` · ${report.dex.map((d) => `${d.name} ($${fmtNum(d.liquidity)})`).slice(0, 3).join(", ")}` : ""}`);
          }
          if (report.trust_list === "1") lines.push("Listed on GoPlus's trust list (well-known token).");
          if (report.note) lines.push(`Note: ${report.note.slice(0, 200)}`);
        }
      }

      // Verification and holders from the explorer: authoritative for "is the code public", and the only screen on chains GoPlus does not cover.
      if (clients.explorer) {
        const [verification, holders, token] = await Promise.all([
          clients.explorer.contractVerification(address, options).catch(() => null),
          info.goplus ? Promise.resolve([]) : clients.explorer.tokenHolders(address, 10, options).catch(() => []),
          info.goplus ? Promise.resolve(null) : clients.explorer.tokenInfo(address, options).catch(() => null),
        ]);
        providers.push(clients.explorer.vendor);
        if (verification) {
          out.checks.push("verification");
          out.verified = verification.verified;
          if (verification.verified) lines.push(`Explorer: verified contract${verification.name ? ` "${verification.name}"` : ""}${verification.compiler ? ` (${verification.compiler})` : ""}${verification.proxy ? ` · proxy${verification.implementation ? ` to ${verification.implementation}` : ""}` : ""}`);
          else {
            lines.push("Explorer: source code NOT verified.");
            if (!out.warnings.some((w) => w.includes("not verified"))) out.warnings.push("source code is not verified on the explorer");
          }
        }
        if (!info.goplus) {
          const decimals = token?.decimals ?? 18;
          const supply = token?.totalSupply ? fromUnits(token.totalSupply, decimals) : 0;
          if (holders.length && supply > 0) {
            const top = holders.slice(0, 10).reduce((s, h) => s + (h.percent !== undefined ? h.percent / 100 : fromUnits(h.raw, decimals) / supply), 0);
            out.topHoldersPct = Number((top * 100).toFixed(1));
            out.holders = token?.holders;
            out.checks.push("holders");
            lines.push(`Holders: ${out.holders !== undefined ? fmtNum(out.holders) : "n/a"} · top 10 hold ${out.topHoldersPct}% of supply (top: ${holders.slice(0, 3).map((h) => `${shortAddr(h.address)} ${(h.percent ?? (fromUnits(h.raw, decimals) / supply) * 100).toFixed(1)}%`).join(", ")})`);
            if (out.topHoldersPct >= 50) out.warnings.push(`top 10 wallets hold ${out.topHoldersPct}% of supply`);
          }
          lines.push("Honeypot, tax and ownership checks are not available on this chain yet (no security indexer covers it).");
        }
      } else if (!info.goplus) {
        lines.push(`No security checks could run on ${info.name}: no security indexer covers it and no explorer key is configured.`);
      }
    } else if (clients.solana) {
      const [report, chain] = await Promise.all([solanaTokenSecurity([address], options).then((r) => r[address] ?? null), clients.solana.mintWithHolders(address, options)]);
      if (!chain.mint) throw new PactError("NOT_FOUND", `${address} is not a token mint on Solana.`);
      providers.push("Solana RPC");
      const supply = fromUnits(chain.mint.supply, chain.mint.decimals);
      const top = chain.largest.slice(0, 10).reduce((s, a) => s + (a.uiAmount ?? 0), 0);
      out.topHoldersPct = supply > 0 ? Number(((top / supply) * 100).toFixed(1)) : undefined;
      out.checks.push("mint authority", "freeze authority", "holders");
      // The largest token accounts on the RPC include liquidity pools and the bonding curve; the indexers below exclude those.
      const rpcTop10 = out.topHoldersPct;
      out.topHoldersPct = undefined;
      lines.push(`Mint ${address}: mint authority ${chain.mint.mintAuthority ?? "revoked"} · freeze authority ${chain.mint.freezeAuthority ?? "revoked"} · supply ${fmtNum(supply)} · top 10 token accounts including pools ${rpcTop10 ?? "n/a"}%`);
      if (chain.mint.mintAuthority) out.warnings.push("mint authority is still active (supply can grow)");
      if (chain.mint.freezeAuthority) out.warnings.push("freeze authority is still active (accounts can be frozen)");
      if (report) {
        providers.push("GoPlus");
        const flags = solanaRiskFlags(report);
        out.severe = flags.severe;
        for (const w of flags.warnings) if (!out.warnings.includes(w)) out.warnings.push(w);
        out.symbol ??= report.metadata?.symbol;
        out.holders = report.holder_count ? Number(report.holder_count) : undefined;
        out.checks.push("transfer fee", "transfer hook", "creator reputation", "liquidity locks");
        lines.push(`GoPlus: ${report.metadata?.name ?? "?"} (${report.metadata?.symbol ?? "?"}) · holders ${out.holders !== undefined ? fmtNum(out.holders) : "n/a"} · trusted ${report.trusted_token === 1 ? "yes" : "no"} · non-transferable ${report.non_transferable === "1" ? "YES" : "no"} · closable ${report.closable?.status === "1" ? "yes" : "no"}`);
        if (report.dex?.length) lines.push(`DEX listings: ${report.dex.slice(0, 3).map((d) => `${d.dex_name ?? "?"} (TVL $${fmtNum(d.tvl)})`).join(", ")}`);
        if (report.creators?.length) lines.push(`Creators: ${report.creators.slice(0, 2).map((c) => `${shortAddr(c.address ?? "?")}${c.malicious_address === 1 ? " (flagged malicious)" : ""}`).join(", ")}`);
      } else {
        lines.push("GoPlus has no report for this mint.");
      }
      if (out.topHoldersPct === undefined) out.topHoldersPct = rpcTop10;
    }

    // Independent holder distribution from GeckoTerminal, and Jupiter's audit on Solana.
    if (info.geckoterminal) {
      const gt = await tokenInfoExtended(info.geckoterminal, address, options).catch(() => null);
      const top10 = gt?.attributes.holders?.distribution_percentage?.top_10 ? Number(gt.attributes.holders.distribution_percentage.top_10) : undefined;
      if (gt && (top10 !== undefined || gt.attributes.gt_score !== undefined)) {
        providers.push("GeckoTerminal");
        out.checks.push("holder distribution (GeckoTerminal)");
        out.topHoldersPct ??= top10;
        lines.push(`GeckoTerminal: GT score ${gt.attributes.gt_score !== null && gt.attributes.gt_score !== undefined ? `${Math.round(gt.attributes.gt_score)}/100` : "n/a"}${top10 !== undefined ? ` · top 10 holders ${top10.toFixed(1)}%` : ""}${gt.attributes.holders?.count ? ` · ${fmtNum(gt.attributes.holders.count)} holders` : ""}${gt.attributes.websites?.length || gt.attributes.twitter_handle ? "" : " · no website or socials listed"}`);
        if (top10 !== undefined && top10 >= 50 && !out.warnings.some((w) => w.startsWith("top 10"))) out.warnings.push(`top 10 holders own ${top10.toFixed(0)}% of supply`);
        if (!gt.attributes.websites?.length && !gt.attributes.twitter_handle) out.warnings.push("no website or socials listed by the indexer");
      }
    }
    if (info.family === "solana") {
      const jup = await tokenByMint(address, options).catch(() => null);
      if (jup) {
        providers.push("Jupiter");
        out.checks.push("Jupiter audit");
        const a = jup.audit;
        lines.push(`Jupiter: ${jup.isVerified ? "verified token" : "NOT on Jupiter's verified list"} · organic score ${jup.organicScore !== undefined ? `${Math.round(jup.organicScore)} (${jup.organicScoreLabel ?? "?"})` : "n/a"}${a ? ` · mint authority ${a.mintAuthorityDisabled ? "disabled" : "ACTIVE"} · freeze authority ${a.freezeAuthorityDisabled ? "disabled" : "ACTIVE"}${a.topHoldersPercentage !== undefined ? ` · top holders ${a.topHoldersPercentage.toFixed(1)}%` : ""}${a.devBalancePercentage !== undefined ? ` · dev balance ${a.devBalancePercentage.toFixed(1)}%` : ""}` : ""}`);
        if (jup.organicScoreLabel === "low") out.warnings.push("low organic trading score on Jupiter (activity may be wash or bot driven)");
        if (a?.devBalancePercentage !== undefined && a.devBalancePercentage >= 20) out.warnings.push(`developer holds ${a.devBalancePercentage.toFixed(0)}% of supply`);
      }
    }

    // Codex: holder composition (snipers, insiders, bundlers, developer), launchpad stage and scam flags. One request, every chain.
    if (clients.codex && clients.codexNetwork) {
      const [m] = await clients.codex.tokenMetrics(clients.codexNetwork, [address], options).catch(() => []);
      if (m) {
        providers.push("Codex");
        out.checks.push("holder composition (Codex)", "scam flags (Codex)");
        out.holders ??= m.holders;
        out.topHoldersPct ??= m.top10HoldersPct;
        const parts = [m.sniperHeldPct !== null && m.sniperHeldPct !== undefined ? `snipers ${m.sniperHeldPct.toFixed(1)}%` : "", m.insiderHeldPct !== null && m.insiderHeldPct !== undefined ? `insiders ${m.insiderHeldPct.toFixed(1)}%` : "", m.bundlerHeldPct !== null && m.bundlerHeldPct !== undefined ? `bundlers ${m.bundlerHeldPct.toFixed(1)}%` : "", m.devHeldPct !== null && m.devHeldPct !== undefined ? `developer ${m.devHeldPct.toFixed(1)}%` : "", m.suspiciousCount ? `${m.suspiciousCount} suspicious wallets` : ""].filter(Boolean);
        lines.push(`Codex: ${m.holders !== undefined ? `${fmtNum(m.holders)} holders` : "holders n/a"}${m.top10HoldersPct !== undefined ? ` · top 10 hold ${m.top10HoldersPct.toFixed(1)}%` : ""}${parts.length ? ` · ${parts.join(", ")}` : " · no sniper/insider/developer breakdown for this token"}${m.launchpad?.name ? ` · launched via ${m.launchpad.name}${m.launchpad.completed ? " (graduated)" : ""}` : ""}${m.isScam ? " · marked as SCAM" : m.potentialScamReasons.length ? ` · potential scam: ${m.potentialScamReasons.join(", ")}` : " · no scam flags"}`);
        if (m.isScam) out.severe.push("marked as a scam by Codex");
        for (const reason of m.potentialScamReasons) out.warnings.push(`potential scam signal: ${reason}`);
        if ((m.sniperHeldPct ?? 0) >= 20) out.warnings.push(`snipers hold ${m.sniperHeldPct!.toFixed(0)}% of supply`);
        if ((m.insiderHeldPct ?? 0) >= 20) out.warnings.push(`insiders hold ${m.insiderHeldPct!.toFixed(0)}% of supply`);
        if ((m.bundlerHeldPct ?? 0) >= 20) out.warnings.push(`bundled wallets hold ${m.bundlerHeldPct!.toFixed(0)}% of supply`);
        if ((m.devHeldPct ?? 0) >= 20) out.warnings.push(`developer holds ${m.devHeldPct!.toFixed(0)}% of supply`);
        if (m.top10HoldersPct !== undefined && m.top10HoldersPct >= 50 && !out.warnings.some((w) => w.startsWith("top 10"))) out.warnings.push(`top 10 wallets hold ${m.top10HoldersPct.toFixed(0)}% of supply`);
      }
    }

    lines.push(out.severe.length ? `SEVERE: ${out.severe.join("; ")}` : "Severe flags: none found by the checks run.");
    lines.push(out.warnings.length ? `Warnings: ${out.warnings.join("; ")}` : "Warnings: none.");
    lines.push(`Checks performed: ${out.checks.join(", ") || "none"}. A clean result means these checks found nothing, not that the token is safe.`);
    return {
      data: out,
      summary: out.severe.length ? `${out.symbol ?? "Token"}: ${out.severe.length} severe ${out.severe.length === 1 ? "flag" : "flags"}, ${out.warnings.length} warnings` : `${out.symbol ?? "Token"}: no severe flags, ${out.warnings.length} ${out.warnings.length === 1 ? "warning" : "warnings"}`,
      evidence: [evidence(info, `${out.symbol ?? address.slice(0, 10)} security`, lines.join("\n"), providers.join(" + ") || "chain", tokenLink(info, address))],
    };
  },
};
