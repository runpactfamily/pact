// Exercises the onchain tools against the real public APIs with the keys in .env.local.
//   node --env-file=.env.local --import tsx scripts/onchain-smoke.ts [tool,tool,...]
import { getProviders } from "../src/server/providers/index";
import { ONCHAIN_TOOLS } from "../src/server/tools/onchain/index";
import type { ToolContext } from "../src/server/tools/types";

const only = (process.argv[2] ?? "").split(",").filter(Boolean);
const cases: { tool: string; input: Record<string, unknown> }[] = [
  { tool: "price_history", input: { chain: "bnb", token: "CAKE", timeframe: "day", points: 365 } },
  { tool: "price_history", input: { chain: "base", token: "BRETT", timeframe: "day", points: 90 } },
  { tool: "token_lookup", input: { chain: "robinhood", token: "0xce9e866c5a5deaef13054f304a006aede94046ff" } },
  { tool: "wallet_inspect", input: { chain: "bnb", address: "0xF977814e90dA44bFA03b6295A0616a897441aceC", limit: 4 } },
  { tool: "price_history", input: { chain: "solana", token: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", timeframe: "hour", points: 24 } },
  { tool: "large_trades", input: { chain: "base", token: "BRETT", minUsd: 5000, limit: 5 } },
  { tool: "compare_tokens", input: { chain: "base", tokens: ["BRETT", "DEGEN", "TOSHI"] } },
  { tool: "defi_overview", input: { chain: "base", focus: "protocols", limit: 5 } },
  { tool: "defi_overview", input: { chain: "solana", focus: "yields", limit: 5 } },
  { tool: "defi_overview", input: { chain: "robinhood", focus: "protocols", limit: 5 } },
  { tool: "wallet_safety", input: { chain: "base", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" } },
  { tool: "new_tokens", input: { chain: "base", maxAgeHours: 24, minLiquidityUsd: 10000, limit: 5 } },
  { tool: "wallet_safety", input: { chain: "bnb", address: "0xF977814e90dA44bFA03b6295A0616a897441aceC" } },
  { tool: "wallet_safety", input: { chain: "solana", address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" } },
  { tool: "token_lookup", input: { chain: "base", token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" } },
  { tool: "token_lookup", input: { chain: "bnb", token: "CAKE" } },
  { tool: "token_lookup", input: { chain: "solana", token: "JUP" } },
  { tool: "token_security", input: { chain: "base", token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" } },
  { tool: "token_security", input: { chain: "solana", token: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" } },
  { tool: "market_overview", input: { chain: "base", limit: 5 } },
  { tool: "market_overview", input: { chain: "robinhood", limit: 5 } },
  { tool: "new_tokens", input: { chain: "solana", maxAgeHours: 24, minLiquidityUsd: 10000, limit: 5 } },
  { tool: "volume_track", input: { chain: "bnb", token: "CAKE" } },
  { tool: "wallet_inspect", input: { chain: "base", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", limit: 5 } },
  { tool: "wallet_inspect", input: { chain: "robinhood", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", limit: 5 } },
  { tool: "wallet_inspect", input: { chain: "solana", address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", limit: 3 } },
];

async function main() {
const providers = getProviders();
for (const c of cases) {
  if (only.length && !only.includes(c.tool)) continue;
  const tool = ONCHAIN_TOOLS.find((t) => t.name === c.tool)!;
  const context: ToolContext = { runId: "smoke", userId: "smoke", providers, signal: new AbortController().signal, timeoutMs: 25_000 };
  const t0 = Date.now();
  try {
    const out = await tool.execute(c.input, context);
    console.log(`\n=== ${c.tool} ${JSON.stringify(c.input)} → ${Date.now() - t0}ms`);
    console.log("summary:", out.summary);
    console.log((out.evidence ?? []).map((e) => `[${e.provider}] ${e.label}${e.url ? ` <${e.url}>` : ""}\n${e.text}`).join("\n").slice(0, 1600));
  } catch (error) {
    console.log(`\n=== ${c.tool} ${JSON.stringify(c.input)} → FAILED ${Date.now() - t0}ms: ${(error as Error).message}`);
  }
}
}

void main();
