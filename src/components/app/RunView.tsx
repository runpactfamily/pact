"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { pact } from "@/lib/pact/client";
import { timeAgo } from "@/lib/pact/format";
import { useRun } from "@/lib/pact/hooks";
import { TERMINAL_STATUSES } from "@/lib/pact/types";
import { AttachmentChip } from "../AttachmentChip";
import { EmptyState } from "../EmptyState";
import { ArrowLeft, ArrowRight } from "../Icons";
import { ResultDocument } from "../run/ResultDocument";
import { RunProgress } from "../run/RunProgress";
import { ChainChip } from "../onchain/ChainSelect";

const SETTLE_MS = 900;

interface RunViewProps {
  /** Where this surface's pages live; "/app" for the app, the onchain base for Pact Onchain. */
  basePath?: string;
}

export function RunView({ basePath = "/app" }: RunViewProps = {}) {
  const home = basePath || "/";
  const { id } = useParams<{ id: string }>();
  const state = useRun(id);
  const [cancelling, setCancelling] = useState(false);
  // When a run ends while we are watching it, let the timeline settle before the result takes over.
  const [settled, setSettled] = useState<string | null>(null);
  const [watched, setWatched] = useState(false);

  const run = state.run;
  const inProgress = state.status === "queued" || state.status === "running";
  const terminal = typeof state.status === "string" && TERMINAL_STATUSES.has(state.status as never);

  // Remember that we saw this run in progress (state adjusted during render, per React guidance).
  if (inProgress && !watched) setWatched(true);

  useEffect(() => {
    if (!terminal || !id || !watched) return;
    const timer = setTimeout(() => setSettled(id), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [terminal, watched, id]);

  if (state.status === "missing" || state.status === "error") {
    return (
      <div className="view">
        <EmptyState
          title={state.status === "missing" ? "This run doesn’t exist" : "This run couldn’t be loaded"}
          body={
            state.status === "missing"
              ? "It may belong to another browser. Runs are scoped to the device that started them."
              : (state.message ?? "Please try again.")
          }
          action={
            <Link href={home} className="btn">
              New run
              <ArrowRight />
            </Link>
          }
        />
      </div>
    );
  }

  async function cancel() {
    if (!id) return;
    setCancelling(true);
    try {
      await pact.cancelRun(id);
    } finally {
      setCancelling(false);
    }
  }

  // A run that ended while we watched it keeps its timeline for a moment; one opened later shows the result at once.
  const showProgress = inProgress || (terminal && watched && settled !== id);

  return (
    <article className="view view--run">
      <Link href={`${basePath}/runs`} className="back">
        <ArrowLeft />
        Runs
      </Link>

      {!run ? (
        <div className="runhead" aria-busy="true">
          <span className="skel" style={{ width: 120 }} />
          <span className="skel skel--title" style={{ width: "80%" }} />
          <span className="skel skel--title" style={{ width: "55%" }} />
        </div>
      ) : (
        <>
          <header className="runhead">
            <p className="label runhead__meta">
              <span>Job</span>
              <span>{timeAgo(run.createdAt)}</span>
              {run.chain && <ChainChip chain={run.chain} />}
            </p>
            <h1 className="runhead__task">{run.task}</h1>
            {run.attachments.length > 0 && (
              <ul className="runhead__attachments" aria-label="Context provided">
                {run.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <AttachmentChip attachment={attachment} />
                  </li>
                ))}
              </ul>
            )}
          </header>

          {showProgress ? (
            <>
              <RunProgress stage={state.stage} activity={state.activity} steps={state.steps} run={run} finished={terminal} variant="full" />
              {inProgress && (
                <div className="runfoot">
                  <button type="button" className="btn btn--ghost" onClick={cancel} disabled={cancelling}>
                    {cancelling ? "Cancelling" : "Cancel run"}
                  </button>
                </div>
              )}
            </>
          ) : state.status === "completed" && run.result ? (
            <div className="page-enter">
              <ResultDocument run={run} />
              <div className="runfoot">
                <Link href={home} className="btn">
                  New run
                  <ArrowRight />
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState
              title={state.status === "cancelled" ? "This run was cancelled" : "This run didn’t finish"}
              body={
                state.status === "cancelled"
                  ? "Nothing was returned. Give Pact the job again whenever you’re ready."
                  : (run.error?.message ?? "Something went wrong while working on it.")
              }
              action={
                <Link href={{ pathname: home, query: { task: run.task, ...(run.chain ? { chain: run.chain } : {}) } }} className="btn">
                  Run it again
                  <ArrowRight />
                </Link>
              }
            />
          )}
        </>
      )}
    </article>
  );
}
