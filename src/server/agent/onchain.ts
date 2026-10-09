import { chainMentionedIn, findIdentifiers, isChainId, type ChainId } from "../onchain/chains";
import type { JobContext } from "./context";
import type { PlanStep } from "./planner";

// Pact Onchain: rule plans and model guidance for jobs from the onchain
// surface. Rules give a sound fallback when the model cannot plan; the model
// refines them with the guidance below.

const TOKEN_WORDS = /\b(token|coin|contract|mint|ticker|rug|rugpull|honeypot|safe|safety|legit|security|scam|audit|due diligence)\b/i;
const WALLET_WORDS = /\b(wallet|address|holdings|portfolio|whale|balance|balances|holder|account)\b/i;
const SECURITY_WORDS = /\b(safe|safety|legit|security|scam|rug|rugpull|honeypot|risk|risky|audit|due diligence|trust|mintable|freeze|renounced)\b/i;
const VOLUME_WORDS = /\b(volume|momentum|pump|pumping|dump|buy pressure|sell pressure|activity|trading|traded|movers?)\b/i;
const HISTORY_WORDS = /\b(history|historical|chart|candles?|ath|all[- ]time high|drawdown|volatility|last (\d+ )?(days?|weeks?|month|hours?)|past (\d+ )?(days?|weeks?|month|hours?)|over the (week|month)|trend)\b/i;
const WHALE_WORDS = /\b(whales?|large (trades?|buys?|sells?)|big (trades?|buys?|sells?)|smart money|who is (buying|selling)|net flow)\b/i;
const COMPARE_WORDS = /\b(compare|comparison|versus|vs\.?|side by side|which (is|one)|better)\b/i;
const DEFI_WORDS = /\b(defi|tvl|protocols?|yields?|apy|apr|staking|lending|stablecoins?|liquidity pools?|farms?|vaults?)\b/i;
const YIELD_WORDS = /\b(yields?|apy|apr|staking|farms?|vaults?)\b/i;
const STABLE_WORDS = /\b(stable|stablecoins?|usdc|usdt|dai)\b/i;
const SAFETY_WALLET_WORDS = /\b(approvals?|revoke|phishing|drainer|scammer|sanction(ed|s)?|mixer|hacker|malicious|blacklist(ed)?|is (this|the) (wallet|address) (safe|risky|legit))\b/i;
const SCREEN_WORDS = /\b(screen|screener|filter|criteria|find (me )?tokens?|tokens? (with|that|where|under|over|above|below)|shortlist|candidates|top (tokens?|holders)|most (held|holders)|graduat(ed|ing|ion)|bonding curve|launchpad|pump\.?fun|bonk\.?fun|snipers?|insiders?|bundl(ed|ers?))\b/i;
const NEW_WORDS = /\b(new|newest|newly|launch(ed|es)?|just (created|launched|listed)|fresh|recently (created|launched|listed)|latest (tokens?|launches|pools?|pairs?))\b/i;
const MARKET_WORDS = /\b(trending|what('s| is) (hot|moving|happening)|market overview|overview|top (volume|gainers|movers|tokens)|movers|market (on|intelligence)|dex volume|ecosystem|gas)\b/i;
const CASHTAG = /\$([A-Za-z][A-Za-z0-9]{1,9})\b/g;
const TICKER = /\b([A-Z][A-Z0-9]{1,9})\b/g;
const NOT_TICKERS = new Set(["I", "A", "THE", "AND", "OR", "ON", "IN", "OF", "TO", "FOR", "IS", "IT", "VS", "USD", "USDC", "USDT", "ETH", "BNB", "SOL", "BSC", "EVM", "DEX", "CEX", "TVL", "FDV", "NFT", "API", "RPC", "OK", "TL", "DR", "LP", "AI", "CEO", "US", "UK", "EU", "APY", "APR", "ATH", "DEFI"]);

/** The chain a job is about: named in the text, else the composer's choice, else inferred from an address, else base. */
export function chainForJob(context: JobContext): ChainId {
  const named = chainMentionedIn(context.job);
  if (named) return named;
  if (isChainId(context.chain)) return context.chain;
  const ids = findIdentifiers(context.job);
  if (ids.solanaAddresses.length || ids.solanaSignatures.length) return "solana";
  return "base";
}

/** Symbols the job names: $PEPE cashtags first, then bare upper-case tickers. */
export function tickersIn(job: string): string[] {
  const out: string[] = [];
  for (const m of job.matchAll(CASHTAG)) out.push(m[1].toUpperCase());
  if (!out.length) for (const m of job.matchAll(TICKER)) if (!NOT_TICKERS.has(m[1])) out.push(m[1]);
  return [...new Set(out)].slice(0, 6);
}

export function onchainRulePlan(context: JobContext): PlanStep[] {
  const job = context.job;
  const chain = chainForJob(context);
  const ids = findIdentifiers(job);
  const steps: PlanStep[] = [];
  const push = (tool: string, input: Record<string, unknown>, label: string) => {
    if (steps.length < 6 && !steps.some((s) => s.tool === tool && JSON.stringify(s.input) === JSON.stringify(input))) steps.push({ tool, input, label });
  };

  const evm = chain !== "solana";
  const txHashes = evm ? ids.evmTxHashes : ids.solanaSignatures;
  for (const hash of txHashes.slice(0, 2)) push("tx_explain", { chain, hash }, `Explain transaction ${hash.slice(0, 10)}…`);

  const addresses = evm ? ids.evmAddresses : ids.solanaAddresses.filter((a) => !ids.solanaSignatures.includes(a));
  // "Is this wallet safe" is about the wallet; "is this token safe" is about the token.
  const walletish = WALLET_WORDS.test(job) && !/\b(token|coin|contract|mint|ticker|honeypot|rug|rugpull)\b/i.test(job);
  const tokenSteps = (token: string, label: string) => {
    push("token_lookup", { chain, token }, `Identify ${label}`);
    if (SECURITY_WORDS.test(job) || TOKEN_WORDS.test(job)) push("token_security", { chain, token }, `Check ${label} for risks`);
    if (HISTORY_WORDS.test(job)) push("price_history", { chain, token }, `Price history of ${label}`);
    if (WHALE_WORDS.test(job)) push("large_trades", { chain, token }, `Large trades in ${label}`);
    if (VOLUME_WORDS.test(job) && !WHALE_WORDS.test(job)) push("volume_track", { chain, token }, `Track volume for ${label}`);
  };

  for (const address of addresses.slice(0, 2)) {
    if (walletish) {
      push("wallet_inspect", { chain, address }, `Inspect ${address.slice(0, 8)}…`);
      if (SAFETY_WALLET_WORDS.test(job) || SECURITY_WORDS.test(job)) push("wallet_safety", { chain, address }, `Safety of ${address.slice(0, 8)}…`);
    } else tokenSteps(address, `${address.slice(0, 8)}…`);
  }

  if (!addresses.length) {
    const tickers = tickersIn(job);
    if (tickers.length >= 2 && COMPARE_WORDS.test(job)) {
      push("compare_tokens", { chain, tokens: tickers }, `Compare ${tickers.join(", ")}`);
      // "…then what moved in X over the last 30 days": history for the tokens named in that sentence.
      for (const sentence of job.split(/[.;!?\n]+/)) {
        if (!HISTORY_WORDS.test(sentence)) continue;
        for (const ticker of tickersIn(sentence).slice(0, 2)) push("price_history", { chain, token: ticker }, `Price history of ${ticker}`);
      }
    } else for (const ticker of tickers.slice(0, 3)) tokenSteps(ticker, ticker);
  }

  if (SCREEN_WORDS.test(job) && !addresses.length) {
    // "graduated" means off the bonding curve; "closest to graduation" or "graduating" means still on it.
    const launchpad = /\b(pump\.?fun|bonk\.?fun|launchpad|bonding curve|graduat(ed|ing|ion))\b/i.test(job) ? (/\b(graduated|after graduation|post[- ]graduation)\b/i.test(job) ? "graduated" : "only") : undefined;
    const launchpadName = /pump\.?fun/i.test(job) ? "Pump.fun" : /bonk\.?fun/i.test(job) ? "Bonk" : undefined;
    const rankBy = launchpad === "only" && /graduat/i.test(job) ? "graduation" : /\b(holders?|most held)\b/i.test(job) ? "holders" : /\bvolume\b/i.test(job) ? "volume24" : /\b(newest|latest|new)\b/i.test(job) ? "newest" : /\b(gainers?|change|up the most)\b/i.test(job) ? "change24" : "trending";
    push("token_screener", { chain, rankBy, ...(launchpad ? { launchpad } : {}), ...(launchpadName ? { launchpadName } : {}) }, `Screen tokens on ${chain}`);
  } else if (NEW_WORDS.test(job) && /\b(tokens?|coins?|pools?|pairs?|launches|listings)\b/i.test(job)) push("new_tokens", { chain }, `Scan new tokens on ${chain}`);
  if (DEFI_WORDS.test(job)) {
    const yields = YIELD_WORDS.test(job);
    push("defi_overview", { chain, focus: yields ? "yields" : "protocols", ...(yields && STABLE_WORDS.test(job) ? { stablecoinOnly: true } : {}) }, `DeFi overview for ${chain}`);
  }
  if (MARKET_WORDS.test(job) || (!steps.length && VOLUME_WORDS.test(job))) push("market_overview", { chain }, `Market overview for ${chain}`);
  return steps;
}

export function onchainPlannerGuidance(context: JobContext): string {
  const chain = chainForJob(context);
  return [
    `This job comes from Pact Onchain, the surface for public blockchain data. Chains: robinhood (Robinhood Chain), base, bnb, solana. Default chain for this job: ${chain}; use it unless the job names another chain. Pass symbols and addresses exactly as the job gives them (a leading $ is fine).`,
    "Tool guide: token_lookup for identity, price, liquidity, age and profile; token_security whenever safety, legitimacy or risk is in question (for due diligence always run both); price_history whenever the job mentions a period or a chart, high, drawdown or volatility: points=7 for a week, 30 for a month, 90 for a quarter, 365 for a year (daily), timeframe=hour with points up to 100 for the last days, or timeframe=minute with points up to 288 for today's moves; volume_track for the last 24h windows and buy/sell pressure; large_trades for whale activity and net flow in the last 24h; compare_tokens whenever two to six tokens are to be compared: one call with all of them, never token_lookup or volume_track per token; market_overview for what is moving on a chain, gas and promoted tokens; new_tokens for recently launched tokens; token_screener for any screen with criteria (liquidity, volume, age, holders, top-10 share, market cap, launchpad stage, Pump.fun) or a ranked list (trending, most held, biggest gainers), with sniper/insider/developer shares per row; defi_overview for TVL, protocols, stablecoins and yields (stablecoinOnly=true for stable yields); wallet_inspect for an address's holdings and activity; wallet_safety for whether an address is flagged and which approvals to revoke; tx_explain for a transaction hash or signature.",
    "token_lookup and price_history already carry the all-time high, market cap rank, exchange listings and year-long change from CoinGecko; never web_search for those. Use web_search only for news or off-chain context the chain cannot answer. On Robinhood Chain, market data (prices, trending, new tokens, trades, candles) comes from one indexer and there is no honeypot/tax screen: say so when it matters.",
  ].join(" ");
}

export const ONCHAIN_SYNTH_GUIDANCE = [
  "This result is for Pact Onchain, a research surface for public blockchain data. Report onchain facts exactly as the evidence states them, with the chain named and explorer links in the sources. Put comparison data in a table.",
  "Security checks are screens, not guarantees: a clean screen is 'no flags found by the checks run', never 'safe'. Never give investment advice, buy/sell calls or price predictions; describe liquidity, volume, holder concentration, authorities and activity, and let the reader decide.",
  "When market data was unavailable for a chain (for example Robinhood Chain), say so plainly instead of estimating.",
].join(" ");
