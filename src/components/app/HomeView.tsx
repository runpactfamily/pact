"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { APP_SUGGESTIONS } from "@/content/site";
import { pact } from "@/lib/pact/client";
import { useModels, useRuns } from "@/lib/pact/hooks";
import type { RunInput } from "@/lib/pact/types";
import { Composer } from "../composer/Composer";
import { EmptyState } from "../EmptyState";
import { AppWash } from "./AppWash";
import { RunList } from "./RunList";

export function HomeView() {
  const router = useRouter();
  const params = useSearchParams();
  const [task, setTask] = useState(params.get("task") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { runs, error: runsError } = useRuns();
  const catalog = useModels();

  async function start(input: RunInput) {
    setBusy(true);
    setError("");
    try {
      const run = await pact.createRun(input);
      router.push(`/app/runs/${run.id}`);
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : "The run could not be started.");
    }
  }

  return (
    <div className="view view--home">
      <AppWash />
      <h1 className="view__title">What do you need done?</h1>

      <Composer size="lg" onSubmit={start} busy={busy} initialTask={task} autoFocus catalog={catalog} />
      {error && (
        <p className="view__error" role="alert">
          {error}
        </p>
      )}

      <div className="suggest">
        <span className="label">Try</span>
        <ul>
          {APP_SUGGESTIONS.map((suggestion) => (
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
          <Link href="/app/runs" className="block__link">
            View all
          </Link>
        </header>
        <RunList
          runs={runs ? runs.slice(0, 5) : null}
          empty={
            runsError ? (
              <EmptyState title="Runs couldn’t be loaded" body={runsError} />
            ) : (
              <EmptyState title="No runs yet" body="Give Pact its first job above. Every run and its result is kept here." />
            )
          }
        />
      </section>
    </div>
  );
}
