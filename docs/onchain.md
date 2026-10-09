# Pact Onchain

A second surface of the same product: give Pact a job about public
blockchain data and get finished work back. It launches together with the
main site: the docs have a "Pact Onchain" section, the footer links to it,
and it is served only on its own host.

## Where it lives

- Source: `src/app/onchain/*` (pages), `src/components/onchain/*` (shell,
  home, chain picker), `src/server/onchain/*` (chains, data sources),
  `src/server/tools/onchain/*` (tools), `src/server/agent/onchain.ts`
  (planner rules and model guidance).
- Host: `ONCHAIN_HOST` (default `onchain.runpact.family`), also `ONCHAIN_URL` in `src/content/site.ts` for the links on the main site. `src/proxy.ts`
  rewrites every page path on that host to `/onchain/*`, so the surface
  appears at the root of the subdomain. On any other host `/onchain/*` is a
  404 unless `PACT_ONCHAIN_PREVIEW=1`, which is how it is tested on
  workers.dev or locally without touching DNS. Any `onchain.*` host (for
  example `onchain.localhost:3000`) is also treated as the onchain host. On
  the dev server the root is redirected to `/onchain` instead of rewritten:
  Next's Fast Refresh reloads endlessly when the URL and the rendered route
  differ, so in development the URL shows `/onchain`; production keeps the
  clean root.
- Runs carry `surface: "onchain"` and a default `chain`; they are stored in
  the same tables (inside the run's `detail` document) and listed with
  `GET /api/runs?surface=onchain`. Runs from `/app` never see the chain tools:
  the tool registry is chosen per run from its surface.
- Read only. No wallets, no keys, no transactions.

## Look

The surface is the app shell on the same cream paper; what sets it apart is
the four chains always in view, each in its own colour (`src/app/onchain/onchain.css`). The chain picker is
four cards with hand-drawn marks (`ChainIcon`), each in its chain's colour;
the selected chain colours the title, the composer's top rule and the
composer chip, and run rows and run headers carry the chain's mark. The
sidebar lists the four chains with a coverage dot from
`GET /api/onchain/chains`.

## Chains

| Chain | Family | RPC (public, no key) | History and balances | Market data | Security |
|---|---|---|---|---|---|
| Robinhood Chain (4663) | EVM | Alchemy, else public | Blockscout unified API, then Alchemy | Codex (DEX data), CoinGecko | verification, holder concentration, Codex scam flags and holder composition |
| Base (8453) | EVM | Alchemy, else public | Ankr, then Alchemy | DexScreener, GeckoTerminal, DefiLlama, CoinGecko, Codex | GoPlus, Codex |
| BNB Chain (56) | EVM | Alchemy, else NodeReal, else public | Ankr, then NodeReal, then Alchemy | DexScreener, GeckoTerminal, DefiLlama, CoinGecko, Codex | GoPlus, Codex |
| Solana | Solana | Helius, else Alchemy, else public | Helius DAS (holdings with prices) or public RPC | DexScreener, GeckoTerminal, DefiLlama, Jupiter, CoinGecko, Codex | GoPlus, Jupiter audit, Codex, mint authorities from RPC |

Keys, all on free plans: `BLOCKSCOUT_API_KEY` (dev.blockscout.com; its
Etherscan-style unified API serves Robinhood Chain on the free tier, 5
requests a second), `ANKR_API_KEY` (ankr.com, freemium; wallet transactions, balances with USD
values, token holders and prices on Base and BNB Chain, 200M credits a
month at 50 requests a minute), `ALCHEMY_API_KEY` (free tier; RPC on all
four chains, Transfers API and priced Portfolio balances on Base, BNB and
Robinhood as the fallback explorer), `NODEREAL_API_KEY` (MegaNode free;
BNB Chain RPC, holders and history behind Ankr), `COINGECKO_API_KEY` (Demo;
all-time high, rank, categories, exchange listings, daily history up to a
year, global market context) , `CODEX_API_KEY` (codex.io "almost free" plan, $1 activation, 10k
requests a month: the screener, per-token sniper/insider/bundler/developer
shares and scam flags, launchpad lifecycle incl. Pump.fun graduation, buy/sell
events with sandwich and wash-trade labels, candles down to 5 minutes, and
the only DEX market data on Robinhood Chain; its holders list and wallet PnL
queries are paid and not used) and `HELIUS_API_KEY` (Solana). EVM explorers
form a chain per network (`ExplorerChain`): each question goes to the first
vendor and moves on when it fails recoverably or has nothing. DexScreener, GeckoTerminal, GoPlus,
DefiLlama and the public RPCs need none. `GET /api/onchain/chains` reports
what each chain can do with the keys that are set; the composer shows the
same notes. Tried and dropped: Etherscan (free tier does not serve Base or
BNB Chain), Moralis (free plan ended in September 2026), Blockscout's hosted explorers (a Cloudflare challenge blocks
servers) and Blockscout's unified API for Base (a paid "featured" chain
there) and BNB (not served). All EVM explorers sit behind one
`EvmExplorer` interface (`src/server/onchain/explorer.ts`), so swapping a
vendor touches one file.

## Tools

All take `chain` (`robinhood | base | bnb | solana`). Each makes two to
six outbound requests; batched JSON-RPC counts as one. A 429 from a public
API is retried once after a short pause. The planner treats an explicit ask
(a comparison, a period, a hash, DeFi, wallet safety, new tokens) as
required: those rule steps run first whatever the model planned, and chain
steps that name the same token differently (`$BRETT`, `brett`) are one step.

| Tool | What it answers | Sources |
|---|---|---|
| `token_lookup` | identity by symbol or address: price, market cap, FDV, liquidity across pairs, 24h volume and change, age, supply, holders, socials, GT score, top-10 holder share; on Solana Jupiter verification, organic score and 24h traders | DexScreener, GeckoTerminal, Jupiter, RPC, Blockscout, Ankr, Helius |
| `token_security` | honeypot, taxes, mintable, proxy, ownership, blacklist, pausable, holder concentration, liquidity locks, verification; an independent holder distribution and GT score; on Solana mint/freeze authority from RPC plus Jupiter's audit and organic score | GoPlus, GeckoTerminal, Jupiter, Blockscout, RPC |
| `market_overview` | trending pools by activity, top pools by 24h volume, tokens paying for promotion, gas and latest block, chain TVL, DEX volume and its 24h change; on Robinhood: gas, block and the explorer's ETH quote | GeckoTerminal, DexScreener, DefiLlama, RPC, Blockscout |
| `new_tokens` | pools younger than N hours above a liquidity floor, ranked by volume, with a batched risk screen | GeckoTerminal, GoPlus |
| `volume_track` | volume, price change and buy/sell share over 5m, 1h, 6h, 24h across all pairs; volume-to-liquidity; last-hour pace | DexScreener, GeckoTerminal |
| `wallet_inspect` | native and token balances (priced where the source prices them), recent transactions with methods and counterparties, contract / wallet / EIP-7702 delegation, malicious-address flags | RPC, Blockscout, Ankr, Helius, DefiLlama, GoPlus |
| `tx_explain` | status, parties, decoded method, value, fee, token transfers; on Solana instructions and balance changes | RPC, Blockscout, Helius |
| `price_history` | daily or hourly candles from the token's main pool: change over the window, high/low with dates, drawdown from the high, volatility, volume trend, sampled series | GeckoTerminal |
| `large_trades` | trades above a USD size in the last 24h: buys vs sells, net flow, biggest trades with address and transaction, addresses with the largest net change | GeckoTerminal |
| `compare_tokens` | 2–6 tokens side by side in one table: price, 24h change, market cap, liquidity, volume, volume/liquidity, buy share, age, risk screen (one batched request plus one per symbol) | DexScreener, GoPlus |
| `defi_overview` | chain TVL with 7d/30d change, stablecoin supply, largest protocols by TVL or best yields above a TVL floor (optionally stablecoin only) | DefiLlama |
| `token_screener` | screen a chain by liquidity, volume, age, holders, top-10 share, market cap and launchpad stage, ranked by trending, volume, holders, 24h change, newest, liquidity, market cap or graduation progress; each row carries sniper, insider, bundler and developer shares and scam flags | Codex |
| `wallet_safety` | malicious-address database flags (phishing, scams, sanctions, mixers, hackers); on Base and BNB Chain the wallet's token approvals with the risk of each spender and which to revoke | GoPlus |

Symbols are resolved to addresses through DexScreener, choosing the token
with the most real 24h volume when several share a symbol (reported
liquidity alone is easy to fake). On Robinhood, Blockscout's token search is
used instead.

## How a run differs from an app run

- Planner rules recognise addresses, hashes, `$TICKERS`, chain names and
  intent words (safety, volume, new, trending) and seed the plan with chain
  tools; the model refines it with onchain-specific guidance and may add a
  web search for news.
- The synthesizer is told to report chain facts verbatim with explorer links,
  to call a clean screen "no flags found", and never to give investment
  advice or price predictions.
- Routing adds weight so onchain jobs run on the heavy tier: the evidence is
  dense tables.

## Checks

```
npm test                                   # includes tests/onchain.test.ts (no network)
node --env-file=.env.local --import tsx scripts/onchain-smoke.ts   # real APIs, every tool
```

## Hosts (live since 9 October 2026)

One Worker serves four custom domains (`routes` in `wrangler.jsonc`), and
`src/proxy.ts` routes by host through `resolveSurfaceRoute`:

| Host | Serves |
|---|---|
| `runpact.family` | the site and the app; `/docs` is sent to the docs host, `/onchain` is a 404 |
| `www.runpact.family` | redirects to the bare domain |
| `docs.runpact.family` | the docs at the root (`DOCS_HOST`); every other page is sent back to the main site |
| `onchain.runpact.family` | Pact Onchain at the root (`ONCHAIN_HOST`) |

The docs are one page for both surfaces (`src/app/(site)/docs/page.tsx`):
Pact, then the Pact Onchain guide (overview, getting started, chains and
coverage, what you can ask, writing a job, reading the result, limits), then
preview status and FAQ. The landing page has a Pact Onchain section
(`src/components/site/OnchainSection.tsx`) whose preview is a real run with
its date shown; replace it with another real run, never with invented figures.

Hosts other than the configured ones (localhost, a workers.dev URL) keep
`/docs` in place. `docs.localhost:3000` works as a local docs host. The
workers.dev URL is disabled now that custom domains are set.

Keep `PACT_ONCHAIN_PREVIEW` unset in production: only the subdomain serves
the surface. After adding a key to `.env.local`, run `npm run cf:secrets`.
