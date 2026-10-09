import { PactError } from "../../errors";
import { ago, fmtNum, fmtPct, fmtUsd, fromUnits } from "../../onchain/format";
import { bestPair, tokenPairs, type DexPair } from "../../onchain/sources/dexscreener";
import { tokenInfoExtended } from "../../onchain/sources/geckoterminal";
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
  name?: string;
  priceUsd?: number;
  marketCap?: number;
  fdv?: number;
  liquidityUsd?: number;
  volume24h?: number;
  change24h?: number;
  pairs: number;
  ageHours?: number;
  holders?: number;
  totalSupply?: number;
  decimals?: number;
  verified?: boolean;
  gtScore?: number;
  top10HoldersPct?: number;
  organicScore?: number;
  jupiterVerified?: boolean;
  rank?: number;
  athUsd?: number;
  athDate?: string;
  fromAthPct?: number;
  change7dPct?: number;
  change30dPct?: number;
  change1yPct?: number;
  exchanges?: string[];
  chains?: number;
  trendingScore?: number;
  sniperHeldPct?: number | null;
  insiderHeldPct?: number | null;
  devHeldPct?: number | null;
  launchpad?: string;
}

function aggregate(pairs: DexPair[]) {
  const liquidityUsd = pairs.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0);
  const volume24h = pairs.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0);
  const created = pairs.map((p) => p.pairCreatedAt ?? 0).filter(Boolean);
  const oldest = created.length ? Math.min(...created) : undefined;
  const dexes = [...new Set(pairs.map((p) => p.dexId))];
  return { liquidityUsd, volume24h, oldest, dexes };
}

export const tokenLookupTool: Tool<Input, Output> = {
  name: "token_lookup",
  description: "Identify a token on a chain by symbol or address: price, market cap, liquidity, 24h volume and change, pairs, age, supply, holders.",
  stage: "researching",
  inputSchema: {
    type: "object",
    properties: { chain: CHAIN_PROPERTY, token: { type: "string", description: "Symbol (e.g. PEPE) or contract/mint address" } },
    required: ["chain", "token"],
  },
  outputSchema: { type: "object", properties: { address: { type: "string" }, priceUsd: { type: "number" }, pairs: { type: "number" } } },
  isAvailable: () => ({ available: true }),
  async execute(input, context) {
    const { info, clients } = requireChain(input.chain);
    const options = sourceOptions(context);
    const resolved = await resolveToken(info, clients, input.token, options);
    const { address } = resolved;
    const lines: string[] = [];
    const out: Output = { chain: info.id, address, symbol: resolved.symbol, name: resolved.name, pairs: 0 };
    const providers: string[] = [];

    // Market data (DexScreener), when the chain is indexed.
    if (info.dexscreener) {
      const pairs = resolved.pairs.length && resolved.resolvedVia === "dexscreener" ? resolved.pairs.filter((p) => p.baseToken.address.toLowerCase() === address.toLowerCase()) : await tokenPairs(info.dexscreener, [address], options);
      const pair = bestPair(pairs, address);
      if (pair) {
        providers.push("DexScreener");
        const agg = aggregate(pairs);
        out.symbol = pair.baseToken.symbol;
        out.name = pair.baseToken.name;
        out.priceUsd = Number(pair.priceUsd ?? NaN) || undefined;
        out.marketCap = pair.marketCap;
        out.fdv = pair.fdv;
        out.liquidityUsd = agg.liquidityUsd;
        out.volume24h = agg.volume24h;
        out.change24h = pair.priceChange?.h24;
        out.pairs = pairs.length;
        out.ageHours = agg.oldest ? Math.floor((Date.now() - agg.oldest) / 3_600_000) : undefined;
        lines.push(`${pair.baseToken.name} (${pair.baseToken.symbol}) on ${info.name}, address ${address}`);
        lines.push(`Price ${fmtUsd(pair.priceUsd)} · 24h ${fmtPct(pair.priceChange?.h24)} · 6h ${fmtPct(pair.priceChange?.h6)} · 1h ${fmtPct(pair.priceChange?.h1)}`);
        lines.push(`Market cap ${fmtUsd(pair.marketCap)} · FDV ${fmtUsd(pair.fdv)} · liquidity ${fmtUsd(agg.liquidityUsd)} across ${pairs.length} ${pairs.length === 1 ? "pair" : "pairs"} (${agg.dexes.join(", ")})`);
        lines.push(`24h volume ${fmtUsd(agg.volume24h)} · 24h buys/sells ${pair.txns?.h24?.buys ?? 0}/${pair.txns?.h24?.sells ?? 0} · main pair ${pair.baseToken.symbol}/${pair.quoteToken.symbol} on ${pair.dexId} (${pair.url})`);
        if (agg.oldest) lines.push(`First pair created ${ago(agg.oldest)} (${new Date(agg.oldest).toISOString().slice(0, 10)})`);
        const sites = pair.info?.websites?.map((w) => w.url) ?? [];
        const socials = pair.info?.socials?.map((s) => `${s.type}: ${s.url}`) ?? [];
        if (sites.length || socials.length) lines.push(`Links: ${[...sites, ...socials].slice(0, 5).join(" · ")}`);
      } else {
        lines.push(`No DEX pair is indexed for ${address} on ${info.name} (DexScreener).`);
      }
    }

    // Onchain facts straight from the chain, then what the explorer adds.
    if (clients.evm) {
      const meta = await clients.evm.erc20(address, options);
      if (!meta.isContract) throw new PactError("NOT_FOUND", `${address} holds no contract code on ${info.name}; it is not a token.`);
      providers.push(clients.evm.vendor);
      out.symbol ??= meta.symbol;
      out.name ??= meta.name;
      out.decimals = meta.decimals;
      if (meta.totalSupply !== undefined && meta.decimals !== undefined) out.totalSupply = fromUnits(meta.totalSupply, meta.decimals);
      lines.push(`Contract: name "${meta.name ?? "?"}", symbol ${meta.symbol ?? "?"}, decimals ${meta.decimals ?? "?"}, total supply ${out.totalSupply !== undefined ? fmtNum(out.totalSupply) : "n/a"}`);
      if (clients.explorer) {
        const token = await clients.explorer.tokenInfo(address, options).catch(() => null);
        if (token) {
          providers.push(clients.explorer.vendor);
          out.holders = token.holders;
          out.verified = token.verified;
          out.priceUsd ??= token.priceUsd;
          const parts = [token.holders !== undefined ? `${fmtNum(token.holders)} holders` : "", token.verified !== undefined ? `contract ${token.verified ? "verified" : "NOT verified"}` : "", token.possibleSpam ? "flagged as possible spam by the indexer" : ""].filter(Boolean);
          if (parts.length) lines.push(`Explorer: ${parts.join(" · ")}`);
        }
      }
    } else if (clients.solana) {
      if (clients.solana.hasDas) {
        const asset = await clients.solana.asset(address, options);
        if (!asset) throw new PactError("NOT_FOUND", `${address} is not a known token mint on Solana.`);
        providers.push("Helius");
        out.symbol ??= asset.token_info?.symbol ?? asset.content?.metadata?.symbol;
        out.name ??= asset.content?.metadata?.name;
        out.decimals = asset.token_info?.decimals;
        if (asset.token_info?.supply !== undefined && asset.token_info.decimals !== undefined) out.totalSupply = asset.token_info.supply / 10 ** asset.token_info.decimals;
        if (asset.token_info?.price_info?.price_per_token) out.priceUsd ??= asset.token_info.price_info.price_per_token;
        lines.push(`Mint: ${asset.content?.metadata?.name ?? "?"} (${out.symbol ?? "?"}), decimals ${out.decimals ?? "?"}, supply ${out.totalSupply !== undefined ? fmtNum(out.totalSupply) : "n/a"}, mint authority ${asset.token_info?.mint_authority ?? "none"}, freeze authority ${asset.token_info?.freeze_authority ?? "none"}`);
        if (asset.content?.metadata?.description) lines.push(`Description: ${asset.content.metadata.description.slice(0, 300)}`);
      } else {
        const { mint } = await clients.solana.mintWithHolders(address, options);
        if (!mint) throw new PactError("NOT_FOUND", `${address} is not a token mint on Solana.`);
        providers.push("Solana RPC");
        out.decimals = mint.decimals;
        out.totalSupply = fromUnits(mint.supply, mint.decimals);
        lines.push(`Mint: decimals ${mint.decimals}, supply ${fmtNum(out.totalSupply)}, mint authority ${mint.mintAuthority ?? "none"}, freeze authority ${mint.freezeAuthority ?? "none"}`);
      }
    }

    // Profile from GeckoTerminal: socials, description, GT score, holder distribution. One request, keyless.
    if (info.geckoterminal) {
      const gt = await tokenInfoExtended(info.geckoterminal, address, options).catch(() => null);
      if (gt) {
        providers.push("GeckoTerminal");
        const a = gt.attributes;
        out.gtScore = a.gt_score ?? undefined;
        const top10 = a.holders?.distribution_percentage?.top_10 ? Number(a.holders.distribution_percentage.top_10) : undefined;
        out.top10HoldersPct = top10;
        out.holders ??= a.holders?.count ?? undefined;
        const socials = [a.websites?.[0] ? `site ${a.websites[0]}` : "", a.twitter_handle ? `x @${a.twitter_handle}` : "", a.telegram_handle ? `telegram ${a.telegram_handle}` : "", a.discord_url ? "discord" : ""].filter(Boolean);
        lines.push(`Profile: GT score ${a.gt_score !== null && a.gt_score !== undefined ? `${Math.round(a.gt_score)}/100` : "n/a"}${a.holders?.count ? ` · ${fmtNum(a.holders.count)} holders` : ""}${top10 !== undefined ? ` · top 10 holders ${top10.toFixed(1)}%` : ""}${a.categories?.length ? ` · ${a.categories.slice(0, 3).join(", ")}` : ""}${socials.length ? ` · ${socials.join(", ")}` : " · no socials listed"}`);
        if (a.description) lines.push(`Description: ${a.description.replace(/\s+/g, " ").slice(0, 280)}`);
      }
    }
    // Jupiter (Solana): verification, organic score, 24h traders. One request, keyless.
    if (info.family === "solana") {
      const jup = await tokenByMint(address, options).catch(() => null);
      if (jup) {
        providers.push("Jupiter");
        out.organicScore = jup.organicScore;
        out.jupiterVerified = jup.isVerified;
        out.holders ??= jup.holderCount;
        out.priceUsd ??= jup.usdPrice;
        out.marketCap ??= jup.mcap;
        const s = jup.stats24h;
        lines.push(`Jupiter: ${jup.isVerified ? "verified" : "not verified"} · organic score ${jup.organicScore !== undefined ? `${Math.round(jup.organicScore)} (${jup.organicScoreLabel ?? "?"})` : "n/a"}${jup.holderCount ? ` · ${fmtNum(jup.holderCount)} holders` : ""}${s ? ` · 24h: ${fmtNum(s.numTraders ?? 0)} traders, ${fmtNum(s.numBuys ?? 0)} buys / ${fmtNum(s.numSells ?? 0)} sells, net buyers ${fmtNum(s.numNetBuyers ?? 0)}, holders ${fmtPct(s.holderChange)}` : ""}${jup.tags?.length ? ` · tags ${jup.tags.slice(0, 4).join(", ")}` : ""}`);
      }
    }

    // Codex: DEX-level metrics with holder, sniper, insider and developer shares, launchpad stage and scam flags. One request.
    if (clients.codex && clients.codexNetwork) {
      const [m] = await clients.codex.tokenMetrics(clients.codexNetwork, [address], options).catch(() => []);
      if (m) {
        providers.push("Codex");
        out.symbol ??= m.symbol;
        out.name ??= m.name;
        out.priceUsd ??= m.priceUsd;
        out.marketCap ??= m.marketCap;
        out.liquidityUsd ??= m.liquidityUsd;
        out.volume24h ??= m.volume24;
        out.change24h ??= m.change24;
        out.holders ??= m.holders;
        out.top10HoldersPct ??= m.top10HoldersPct;
        out.trendingScore = m.trendingScore;
        out.sniperHeldPct = m.sniperHeldPct;
        out.insiderHeldPct = m.insiderHeldPct;
        out.devHeldPct = m.devHeldPct;
        out.launchpad = m.launchpad?.name ?? undefined;
        if (!out.ageHours && m.createdAt) out.ageHours = Math.floor((Date.now() - m.createdAt) / 3_600_000);
        const shares = [m.sniperHeldPct !== null && m.sniperHeldPct !== undefined ? `snipers ${m.sniperHeldPct.toFixed(1)}%` : "", m.insiderHeldPct !== null && m.insiderHeldPct !== undefined ? `insiders ${m.insiderHeldPct.toFixed(1)}%` : "", m.bundlerHeldPct !== null && m.bundlerHeldPct !== undefined ? `bundlers ${m.bundlerHeldPct.toFixed(1)}%` : "", m.devHeldPct !== null && m.devHeldPct !== undefined ? `developer ${m.devHeldPct.toFixed(1)}%` : ""].filter(Boolean);
        lines.push(`Codex: price ${fmtUsd(m.priceUsd)} · liquidity ${fmtUsd(m.liquidityUsd)} · 24h volume ${fmtUsd(m.volume24)} (${fmtPct(m.change24)}) · ${m.holders !== undefined ? `${fmtNum(m.holders)} holders` : "holders n/a"}${m.top10HoldersPct !== undefined ? ` · top 10 hold ${m.top10HoldersPct.toFixed(1)}%` : ""}${m.buyCount24 !== undefined ? ` · 24h buys/sells ${m.buyCount24}/${m.sellCount24 ?? 0} by ${m.uniqueBuys24 ?? 0}/${m.uniqueSells24 ?? 0} wallets` : ""}${m.trendingScore !== undefined ? ` · trending score ${m.trendingScore.toFixed(2)}` : ""}${m.exchanges.length ? ` · DEXes ${m.exchanges.slice(0, 3).join(", ")}` : ""}`);
        if (shares.length || m.launchpad?.name || m.athPriceUsd) lines.push(`Codex detail: ${[shares.length ? `held by ${shares.join(", ")}` : "", m.walletAgeAvgDays !== undefined ? `average holder wallet age ${m.walletAgeAvgDays.toFixed(0)} days` : "", m.launchpad?.name ? `launched via ${m.launchpad.name}${m.launchpad.completed ? " (graduated)" : m.launchpad.graduationPct !== null && m.launchpad.graduationPct !== undefined ? ` (${m.launchpad.graduationPct.toFixed(0)}% to graduation)` : ""}` : "", m.athPriceUsd ? `DEX all-time high ${fmtUsd(m.athPriceUsd)}${m.athAt ? ` ${ago(m.athAt)}` : ""}` : ""].filter(Boolean).join(" · ")}`);
        if (m.isScam || m.potentialScamReasons.length) lines.push(`Codex flags: ${m.isScam ? "marked as SCAM" : ""}${m.potentialScamReasons.length ? ` potential scam reasons: ${m.potentialScamReasons.join(", ")}` : ""}`);
      }
    }

    // CoinGecko: the aggregated view across every market, all-time high, rank, exchange listings. One request.
    if (clients.coingecko && clients.coingeckoPlatform) {
      const cg = await clients.coingecko.coinByContract(clients.coingeckoPlatform, address, options).catch(() => null);
      if (cg) {
        providers.push("CoinGecko");
        out.rank = cg.rank;
        out.athUsd = cg.athUsd;
        out.athDate = cg.athDate?.slice(0, 10);
        out.fromAthPct = cg.athChangePct;
        out.change7dPct = cg.change7dPct;
        out.change30dPct = cg.change30dPct;
        out.change1yPct = cg.change1yPct;
        out.chains = cg.platforms;
        out.exchanges = cg.tickers.map((t) => t.exchange);
        out.priceUsd ??= cg.priceUsd;
        out.marketCap ??= cg.marketCapUsd;
        out.name ??= cg.name;
        out.symbol ??= cg.symbol.toUpperCase();
        lines.push(`CoinGecko (${cg.id}): rank ${cg.rank ?? "unranked"} · market cap ${fmtUsd(cg.marketCapUsd)} · 24h volume all markets ${fmtUsd(cg.volume24hUsd)} · 7d ${fmtPct(cg.change7dPct)} · 30d ${fmtPct(cg.change30dPct)} · 1y ${fmtPct(cg.change1yPct)}`);
        lines.push(`All-time high ${fmtUsd(cg.athUsd)} on ${cg.athDate?.slice(0, 10) ?? "?"} (now ${fmtPct(cg.athChangePct)} from it) · all-time low ${fmtUsd(cg.atlUsd)} on ${cg.atlDate?.slice(0, 10) ?? "?"} · circulating ${fmtNum(cg.circulatingSupply)} of ${cg.maxSupply ? `max ${fmtNum(cg.maxSupply)}` : `total ${fmtNum(cg.totalSupply)}`}${cg.platforms > 1 ? ` · deployed on ${cg.platforms} chains` : ""}`);
        if (cg.tickers.length) lines.push(`Top markets by volume: ${cg.tickers.slice(0, 5).map((t) => `${t.exchange} (${t.target}, ${fmtUsd(t.volumeUsd)})`).join(", ")}`);
        if (cg.categories.length) lines.push(`Categories: ${cg.categories.slice(0, 4).join(", ")}${cg.homepage ? ` · ${cg.homepage}` : ""}${cg.twitter ? ` · x @${cg.twitter}` : ""}`);
      }
    }

    const title = `${out.symbol ?? out.name ?? address.slice(0, 10)} token`;
    return {
      data: out,
      summary: out.priceUsd !== undefined ? `${out.symbol ?? "Token"} on ${info.name}: ${fmtUsd(out.priceUsd)}, liquidity ${fmtUsd(out.liquidityUsd)}, 24h volume ${fmtUsd(out.volume24h)}` : `${out.symbol ?? "Token"} on ${info.name}: identified at ${address.slice(0, 10)}…, no market price available`,
      evidence: [evidence(info, title, lines.join("\n"), providers.join(" + ") || "chain", tokenLink(info, address))],
    };
  },
};
