"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { pact } from "@/lib/pact/client";
import { useChains, useModels, useRuns } from "@/lib/pact/hooks";
import type { ChainId, RunInput } from "@/lib/pact/types";
import { CHAIN_IDS } from "@/lib/pact/types";
import { Composer } from "../composer/Composer";
import { EmptyState } from "../EmptyState";
import { RunList } from "../app/RunList";
import { CHAIN_COLORS, CHAIN_NAMES, CHAIN_TEXT } from "./ChainIcon";
import { ChainChip, ChainSelect } from "./ChainSelect";
import { OnchainWash } from "./OnchainWash";
import { useOnchainBase } from "./OnchainShell";

const SUGGESTIONS: Record<ChainId, string[]> = {
  base: [
    "Is $BRETT on Base safe to trade? Check the contract, liquidity locks and holder concentration.",
    "What is moving on Base right now, and which trending tokens have real volume behind them?",
    "Newest tokens on Base in the last 12 hours with at least $20k liquidity, screened for risk.",
    "Compare $BRETT, $DEGEN and $TOSHI on Base: liquidity, volume, buy pressure and risk.",
    "Largest DeFi protocols on Base by TVL, stablecoin supply, and the best stable yields above $1M TVL.",
    "Screen Base for tokens under 3 days old with over $50k liquidity, 300+ holders and top-10 share under 40%.",
  ],
  bnb: [
    "Due diligence on $CAKE on BNB Chain: identity, security, volume and buy/sell pressure.",
    "What is trending on BNB Chain today, with 24h volume and liquidity for each?",
    "Newest tokens on BNB Chain in the last 24 hours with real liquidity, screened for honeypots.",
    "Price history of $CAKE over the last year: distance from the all-time high, volatility and volume trend.",
  ],
  solana: [
    "Is $JUP on Solana safe? Check mint and freeze authority, holders and liquidity.",
    "Newest tokens on Solana in the last 6 hours with real liquidity, screened for risk.",
    "What is moving on Solana right now, and where is the volume concentrated?",
    "Whale activity in $JUP today: trades above $10k, net flow, and who is buying.",
    "Pump.fun tokens on Solana closest to graduation right now, with sniper and developer shares.",
  ],
  robinhood: [
    "What is trending on Robinhood Chain right now, with volume, liquidity and holders for each token?",
    "Largest DeFi protocols on Robinhood Chain by TVL, stablecoin supply, and what the network looks like right now.",
    "Inspect this wallet on Robinhood Chain: 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "Explain this Robinhood Chain transaction: paste a transaction hash.",
  ],
};

const isChain = (value: string | null): value is ChainId => Boolean(value) && (CHAIN_IDS as readonly string[]).includes(value as string);

export function OnchainHome() {
  const router = useRouter();
  const params = useSearchParams();
  const base = useOnchainBase();
  const [task, setTask] = useState(params.get("task") ?? "");
  const [chain, setChain] = useState<ChainId>(isChain(params.get("chain")) ? (params.get("chain") as ChainId) : "base");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { runs, error: runsError } = useRuns("onchain");
  const catalog = useModels();
  const chains = useChains();

  async function start(input: RunInput) {
    setBusy(true);
    setError("");
    try {
      const run = await pact.createRun({ ...input, surface: "onchain", chain });
      router.push(`${base}/runs/${run.id}`);
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : "The run could not be started.");
    }
  }

  const current = chains?.find((c) => c.id === chain);

  return (
    <div className="view view--home view--onchain" style={{ "--chain": CHAIN_COLORS[chain], "--chain-ink": CHAIN_TEXT[chain] } as React.CSSProperties}>
      <OnchainWash chain={chain} />
      <p className="label onchain__kicker">Public chain data · read only</p>
      <h1 className="view__title">
        What do you want to know on <span className="onchain__chainword">{CHAIN_NAMES[chain]}</span>?
      </h1>

      <ChainSelect chains={chains} value={chain} onChange={setChain} disabled={busy} />

      <Composer
        size="lg"
        onSubmit={start}
        busy={busy}
        initialTask={task}
        autoFocus
        catalog={catalog}
        placeholder={`A token, a wallet, a transaction, or ${CHAIN_NAMES[chain]} itself. Ask for what you need to know.`}
        leading={<ChainChip chain={chain} />}
      />
      {error && (
        <p className="view__error" role="alert">
          {error}
        </p>
      )}
      {current?.notes.length ? <p className="onchain__note">{current.notes.join(" ")}</p> : null}

      <div className="suggest">
        <span className="label">Try</span>
        <ul>
          {SUGGESTIONS[chain].map((suggestion) => (
            <li key={suggestion}>
              <button type="button" className="suggest__item" onClick={() => setTask(suggestion)} disabled={busy}>
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <section className="block">
        <header className="block__head">
          <h2 className="label">Recent runs</h2>
          <Link href={`${base}/runs`} className="block__link">
            View all
          </Link>
        </header>
        <RunList
          runs={runs ? runs.slice(0, 5) : null}
          basePath={base}
          empty={
            runsError ? (
              <EmptyState title="Runs couldn’t be loaded" body={runsError} />
            ) : (
              <EmptyState title="No runs yet" body="Give Pact Onchain its first job above. Every run and its result is kept here." />
            )
          }
        />
      </section>
    </div>
  );
}
