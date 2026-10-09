"use client";

import { RunsView } from "../app/RunsView";
import { RunView } from "../app/RunView";
import { useOnchainBase } from "./OnchainShell";

export function OnchainRuns() {
  const base = useOnchainBase();
  return <RunsView surface="onchain" basePath={base} title="Runs" sub="Every onchain job you have given Pact, with its result." />;
}

export function OnchainRun() {
  const base = useOnchainBase();
  return <RunView basePath={base} />;
}
