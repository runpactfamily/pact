import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContext } from "../src/server/agent/context";
import { assembleContext } from "../src/server/agent/contextManager";
import { chainForJob, onchainRulePlan, tickersIn } from "../src/server/agent/onchain";
import { mergePlans } from "../src/server/agent/planner";
import { chainMentionedIn, explorerLink, findIdentifiers, CHAINS } from "../src/server/onchain/chains";
import { ExplorerChain, type EvmExplorer } from "../src/server/onchain/explorer";
import { PactError } from "../src/server/errors";
import { resolveSurfaceRoute } from "../src/server/onchain/routing";
import { bestPair, type DexPair } from "../src/server/onchain/sources/dexscreener";
import { evmRiskFlags } from "../src/server/onchain/sources/goplus";
import { validateRunInput } from "../src/server/runs/manager";
import type { RunRecord } from "../src/server/runs/types";
import { ONCHAIN_TOOL_NAMES } from "../src/server/tools/onchain/index";
import { createDefaultRegistry, createOnchainRegistry, getRegistry } from "../src/server/tools/registry";

const EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SOL = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const TX = "0x" + "ab".repeat(32);

function run(job: string, extra: Partial<RunRecord> = {}): RunRecord {
  return { id: "run_x", userId: "u", title: job, job, attachments: [], status: "queued", stage: "understanding", createdAt: 1, steps: [], toolCalls: [], activity: [], sources: [], selection: { mode: "auto" }, surface: "onchain", ...extra };
}

test("identifiers and chain mentions are found in free text", () => {
  const ids = findIdentifiers(`check ${EVM} and tx ${TX}, plus ${SOL}.`);
  assert.deepEqual(ids.evmAddresses, [EVM]);
  assert.deepEqual(ids.evmTxHashes, [TX]);
  assert.deepEqual(ids.solanaAddresses, [SOL]);
  assert.equal(chainMentionedIn("what is trending on BNB chain"), "bnb");
  assert.equal(chainMentionedIn("is this safe on Base?"), "base");
  assert.equal(chainMentionedIn("the base rate of this token"), undefined);
  assert.equal(chainMentionedIn("solana memecoins"), "solana");
  assert.equal(chainMentionedIn("robinhood chain stats"), "robinhood");
  assert.equal(explorerLink(CHAINS.solana, "address", SOL), `https://solscan.io/account/${SOL}`);
  assert.equal(explorerLink(CHAINS.base, "tx", TX), `https://base.blockscout.com/tx/${TX}`);
});

test("rule plan: a token with safety words gets lookup + security on the named chain", () => {
  const steps = onchainRulePlan(buildContext(run(`Is $PEPE on BNB chain safe to trade? check the volume too`, { chain: "base" })));
  assert.deepEqual(
    steps.map((s) => `${s.tool}:${s.input.chain}:${s.input.token ?? ""}`),
    ["token_lookup:bnb:PEPE", "token_security:bnb:PEPE", "volume_track:bnb:PEPE"],
  );
});

test("rule plan: addresses, wallets, transactions and discovery", () => {
  assert.deepEqual(onchainRulePlan(buildContext(run(`what has wallet ${EVM} been doing on Base`))).map((s) => s.tool), ["wallet_inspect"]);
  assert.deepEqual(onchainRulePlan(buildContext(run(`explain ${TX}`, { chain: "base" }))).map((s) => s.tool), ["tx_explain"]);
  assert.deepEqual(onchainRulePlan(buildContext(run("newest tokens on solana with real liquidity"))).map((s) => `${s.tool}:${s.input.chain}`), ["new_tokens:solana"]);
  assert.deepEqual(onchainRulePlan(buildContext(run("what is trending right now", { chain: "bnb" }))).map((s) => `${s.tool}:${s.input.chain}`), ["market_overview:bnb"]);
  assert.equal(chainForJob(buildContext(run(`inspect ${SOL}`))), "solana");
  assert.deepEqual(tickersIn("compare $brett and $DEGEN"), ["BRETT", "DEGEN"]);
  assert.deepEqual(tickersIn("Is CAKE safe on BSC"), ["CAKE"]);
});

test("app runs never see the chain tools; onchain runs get them on top of the general tools", () => {
  const app = createDefaultRegistry();
  const onchain = createOnchainRegistry();
  for (const name of ONCHAIN_TOOL_NAMES) {
    assert.equal(app.has(name), false, name);
    assert.equal(onchain.has(name), true, name);
  }
  assert.equal(onchain.has("web_search"), true);
  assert.equal(getRegistry("app").has("token_lookup"), false);
  assert.equal(getRegistry("onchain").has("token_lookup"), true);
  assert.throws(() => onchain.validateInput("token_lookup", { chain: "ethereum", token: "x" }), /must be one of/);
  assert.deepEqual(onchain.validateInput("wallet_inspect", { chain: "base", address: EVM, extra: 1 }), { chain: "base", address: EVM });
});

test("run input carries surface and chain, and ignores a chain outside the onchain surface", () => {
  const onchain = validateRunInput({ task: "check this", surface: "onchain", chain: "solana" });
  assert.equal(onchain.surface, "onchain");
  assert.equal(onchain.chain, "solana");
  const app = validateRunInput({ task: "check this", chain: "solana" });
  assert.equal(app.surface, "app");
  assert.equal(app.chain, undefined);
  assert.equal(validateRunInput({ task: "x", surface: "onchain", chain: "ethereum" }).chain, undefined);
});

test("host routing: onchain host serves the surface at the root, other hosts hide it unless previewing", () => {
  const config = { onchainHost: "onchain.runpact.family", preview: false };
  assert.deepEqual(resolveSurfaceRoute("onchain.runpact.family", "/", config), { kind: "rewrite", pathname: "/onchain" });
  assert.deepEqual(resolveSurfaceRoute("onchain.runpact.family:443", "/runs/run_1", config), { kind: "rewrite", pathname: "/onchain/runs/run_1" });
  assert.deepEqual(resolveSurfaceRoute("onchain.localhost:3000", "/runs", config), { kind: "rewrite", pathname: "/onchain/runs" });
  assert.deepEqual(resolveSurfaceRoute("onchain.runpact.family", "/api/runs", config), { kind: "pass" });
  assert.deepEqual(resolveSurfaceRoute("onchain.runpact.family", "/onchain/runs", config), { kind: "pass" });
  assert.deepEqual(resolveSurfaceRoute("runpact.family", "/onchain", config), { kind: "block" });
  assert.deepEqual(resolveSurfaceRoute("runpact.family", "/onchain/runs/x", config), { kind: "block" });
  assert.deepEqual(resolveSurfaceRoute("runpact.family", "/app", config), { kind: "pass" });
  assert.deepEqual(resolveSurfaceRoute("pact.example.workers.dev", "/onchain", { ...config, preview: true }), { kind: "pass" });
  // The dev server redirects instead (Fast Refresh cannot cope with a rewritten root).
  assert.deepEqual(resolveSurfaceRoute("onchain.localhost:3000", "/", { ...config, mode: "redirect" }), { kind: "redirect", pathname: "/onchain" });
  assert.deepEqual(resolveSurfaceRoute("onchain.localhost:3000", "/onchain/runs", { ...config, mode: "redirect" }), { kind: "pass" });
});

test("host routing: the docs live on their own host, and the main site sends /docs and www there", () => {
  const config = { onchainHost: "onchain.runpact.family", docsHost: "docs.runpact.family", siteHost: "runpact.family", preview: false };
  assert.deepEqual(resolveSurfaceRoute("docs.runpact.family", "/", config), { kind: "rewrite", pathname: "/docs" });
  assert.deepEqual(resolveSurfaceRoute("docs.runpact.family", "/docs", config), { kind: "redirect", pathname: "/" });
  assert.deepEqual(resolveSurfaceRoute("docs.runpact.family", "/app/runs", config), { kind: "external", host: "runpact.family", pathname: "/app/runs" });
  assert.deepEqual(resolveSurfaceRoute("docs.runpact.family", "/onchain", config), { kind: "block" });
  assert.deepEqual(resolveSurfaceRoute("docs.runpact.family", "/api/health", config), { kind: "pass" });
  assert.deepEqual(resolveSurfaceRoute("runpact.family", "/docs", config), { kind: "external", host: "docs.runpact.family", pathname: "/" });
  assert.deepEqual(resolveSurfaceRoute("runpact.family", "/", config), { kind: "pass" });
  assert.deepEqual(resolveSurfaceRoute("www.runpact.family", "/how-it-works", config), { kind: "external", host: "runpact.family", pathname: "/how-it-works" });
  // Hosts without the custom domain keep the docs where they are.
  assert.deepEqual(resolveSurfaceRoute("pact.example.workers.dev", "/docs", config), { kind: "pass" });
  // Local: docs.localhost belongs to localhost, and the dev server redirects instead of rewriting.
  assert.deepEqual(resolveSurfaceRoute("docs.localhost:3000", "/app", config), { kind: "external", host: "localhost", pathname: "/app" });
  assert.deepEqual(resolveSurfaceRoute("docs.localhost:3000", "/", { ...config, mode: "redirect" }), { kind: "redirect", pathname: "/docs" });
  assert.deepEqual(resolveSurfaceRoute("docs.localhost:3000", "/docs", { ...config, mode: "redirect" }), { kind: "pass" });
  assert.deepEqual(resolveSurfaceRoute("localhost:3000", "/docs", { ...config, siteHost: "localhost", docsHost: "docs.localhost", mode: "redirect" }), { kind: "pass" });
});

test("best pair prefers the token with real volume over a pair that merely reports liquidity", () => {
  const pair = (address: string, symbol: string, liquidity: number, volume: number): DexPair => ({ chainId: "solana", dexId: "raydium", url: "", pairAddress: address + "p", baseToken: { address, name: symbol, symbol }, quoteToken: { address: "q", name: "USDC", symbol: "USDC" }, liquidity: { usd: liquidity }, volume: { m5: 0, h1: 0, h6: 0, h24: volume } });
  const fake = pair("FAKE", "JUP", 40_000_000, 180);
  const real1 = pair("REAL", "JUP", 5_000_000, 20_000_000);
  const real2 = pair("REAL", "JUP", 9_000_000, 15_000_000);
  assert.equal(bestPair([fake, real1, real2], "JUP"), real2);
  assert.equal(bestPair([fake, real1], "FAKE"), fake);
});

test("GoPlus flags read as plain language and separate severe from warnings", () => {
  const flags = evmRiskFlags({ is_honeypot: "1", buy_tax: "0.05", sell_tax: "0.3", is_mintable: "1", is_open_source: "0", holders: [{ address: "a", percent: "0.6" }] });
  assert.ok(flags.severe.some((f) => f.includes("honeypot")));
  assert.ok(flags.severe.some((f) => f.includes("very high tax")));
  assert.ok(flags.warnings.some((f) => f.includes("minted")));
  assert.ok(flags.warnings.some((f) => f.includes("not verified")));
  assert.ok(flags.warnings.some((f) => f.includes("top 10 wallets hold 60%")));
  assert.deepEqual(evmRiskFlags({ is_honeypot: "0", is_open_source: "1" }), { severe: [], warnings: [] });
});

test("chain evidence from different tools survives context assembly even when it shares an explorer link", () => {
  const url = "https://basescan.org/token/0xabc";
  const evidence = [
    { kind: "chain" as const, label: "BRETT token (Base)", text: "price and liquidity", url, provider: "DexScreener" },
    { kind: "chain" as const, label: "BRETT security (Base)", text: "no severe flags", url, provider: "GoPlus" },
    { kind: "chain" as const, label: "BRETT volume (Base)", text: "24h volume", url, provider: "DexScreener" },
  ];
  const assembled = assembleContext(evidence, ["brett"], { maxSourceChars: 2000, maxContextChars: 10000 });
  assert.equal(assembled.items.length, 3);
  assert.equal(assembled.dropped, 0);
});

test("rule plan: comparisons, history, whales, DeFi and wallet safety map to the new tools", () => {
  const plan = (job: string, chain?: string) => onchainRulePlan(buildContext(run(job, chain ? { chain } : {}))).map((s) => `${s.tool}:${s.input.chain}`);
  assert.deepEqual(plan("Compare $BRETT vs $DEGEN on Base"), ["compare_tokens:base"]);
  assert.deepEqual(plan("price history of $CAKE over the last 30 days", "bnb"), ["token_lookup:bnb", "price_history:bnb"]);
  assert.deepEqual(plan("whale activity in $JUP today, who is buying", "solana"), ["token_lookup:solana", "large_trades:solana"]);
  assert.deepEqual(plan("best stable yields on Base above $1M TVL"), ["defi_overview:base"]);
  const defi = onchainRulePlan(buildContext(run("best stable yields on Base above $1M TVL")))[0];
  assert.deepEqual(defi.input, { chain: "base", focus: "yields", stablecoinOnly: true });
  assert.deepEqual(plan(`is this wallet safe, any approvals to revoke? ${EVM}`, "bnb"), ["wallet_inspect:bnb", "wallet_safety:bnb"]);
});

test("mergePlans dedupes chain steps that name the same token differently and keeps explicit asks first", () => {
  const rules = [
    { tool: "compare_tokens", input: { chain: "base", tokens: ["BRETT", "DEGEN"] }, label: "r1" },
    { tool: "price_history", input: { chain: "base", token: "BRETT" }, label: "r2" },
  ];
  const model = [
    { tool: "token_lookup", input: { chain: "base", token: "$brett" }, label: "m1" },
    { tool: "compare_tokens", input: { chain: "base", tokens: ["$DEGEN", "$BRETT"] }, label: "m2" },
    { tool: "price_history", input: { chain: "base", token: "brett", points: 30 }, label: "m3" },
    { tool: "token_lookup", input: { chain: "base", token: "BRETT" }, label: "m4" },
  ];
  assert.deepEqual(mergePlans(rules, model, 9).map((s) => s.label), ["r1", "r2", "m1"]);
});

test("explorer chain: moves to the next vendor on recoverable failure or empty answers, stops on real errors", async () => {
  const calls: string[] = [];
  const make = (vendor: string, mode: "fail" | "empty" | "ok" | "bad"): EvmExplorer => ({
    vendor,
    async recentTransactions() {
      calls.push(vendor);
      if (mode === "fail") throw new PactError("RATE_LIMITED", vendor + " limited");
      if (mode === "bad") throw new PactError("INVALID_REQUEST", "bad address");
      return mode === "ok" ? [{ hash: "0x1", from: "a", to: "b", valueWei: "0" }] : [];
    },
    async tokenBalances() {
      return [];
    },
    async tokenInfo() {
      return null;
    },
    async tokenHolders() {
      return [];
    },
    async contractVerification() {
      return null;
    },
    async transactionDetail() {
      return null;
    },
  });
  const o = { timeoutMs: 1000 };
  const chain = new ExplorerChain([make("A", "fail"), make("B", "empty"), make("C", "ok")]);
  assert.equal((await chain.recentTransactions("x", 5, o)).length, 1);
  assert.deepEqual(calls, ["A", "B", "C"]);
  assert.equal(chain.vendor, "C");
  await assert.rejects(() => new ExplorerChain([make("D", "bad"), make("E", "ok")]).recentTransactions("x", 5, o), /bad address/);
  assert.deepEqual(await new ExplorerChain([make("F", "fail"), make("G", "fail")]).recentTransactions("x", 5, o), []);
});

test("rule plan: screens with criteria and launchpad asks go to token_screener", () => {
  const plan = (job: string, chain?: string) => onchainRulePlan(buildContext(run(job, chain ? { chain } : {})));
  assert.deepEqual(plan("Screen Base for tokens under 3 days old with over $50k liquidity").map((s) => s.tool + ":" + s.input.chain), ["token_screener:base"]);
  const pump = plan("Pump.fun tokens on Solana closest to graduation right now")[0];
  assert.deepEqual(pump.input, { chain: "solana", rankBy: "graduation", launchpad: "only", launchpadName: "Pump.fun" });
  assert.equal(plan("which tokens on BNB chain have the most holders")[0].input.rankBy, "holders");
  assert.deepEqual(plan("newest tokens on solana with real liquidity").map((s) => s.tool), ["new_tokens"]);
  assert.deepEqual(plan("find tokens on Base with over 1000 holders and under $5M market cap").map((s) => s.tool), ["token_screener"]);
});
