"use client";

import { useEffect, useState } from "react";
import { pact } from "./client";
import { TERMINAL_STATUSES } from "./types";
import type { ChainCapabilities, ModelCatalog, Run, RunStage, RunStatus, RunStepInfo, RunSurface } from "./types";

export interface ActivityLine {
  message: string;
  /** Milliseconds since the run started. */
  t: number;
}

export interface RunState {
  status: "idle" | "loading" | "missing" | "error" | RunStatus;
  run: Run | null;
  stage: RunStage;
  activity: ActivityLine[];
  /** Steps as the server reports them, in order. */
  steps: RunStepInfo[];
  /** Set when loading the run itself failed. */
  message?: string;
}

interface Tracked extends RunState {
  /** Which run id this state belongs to. */
  id: string | null;
}

const IDLE: RunState = { status: "idle", run: null, stage: "understanding", activity: [], steps: [] };

/** All runs, newest first. `null` while loading; `error` when the backend could not be reached. */
export function useRuns(surface?: RunSurface): { runs: Run[] | null; error: string | null } {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    pact
      .listRuns(surface)
      .then((list) => {
        if (live) setRuns(list);
      })
      .catch((caught: unknown) => {
        if (!live) return;
        setRuns([]);
        setError(caught instanceof Error ? caught.message : "Runs could not be loaded.");
      });
    return () => {
      live = false;
    };
  }, [surface]);
  return { runs, error };
}

/** The chains Pact Onchain supports, with what each can do. `null` while loading. */
export function useChains(): ChainCapabilities[] | null {
  const [chains, setChains] = useState<ChainCapabilities[] | null>(null);
  useEffect(() => {
    let live = true;
    pact
      .listChains()
      .then((list) => {
        if (live) setChains(list);
      })
      .catch(() => {
        if (live) setChains([]);
      });
    return () => {
      live = false;
    };
  }, []);
  return chains;
}

/** Live model lists per vendor. `null` while loading. */
export function useModels(): ModelCatalog | null {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  useEffect(() => {
    let live = true;
    pact
      .listModels()
      .then((c) => {
        if (live) setCatalog(c);
      })
      .catch(() => {
        if (live) setCatalog({ fetchedAt: Date.now(), vendors: [] });
      });
    return () => {
      live = false;
    };
  }, []);
  return catalog;
}

function upsertStep(steps: RunStepInfo[], step: RunStepInfo): RunStepInfo[] {
  const i = steps.findIndex((s) => s.id === step.id);
  if (i === -1) return [...steps, step];
  const next = steps.slice();
  next[i] = step;
  return next;
}

/** Loads a run and follows its progress until it reaches a terminal state. */
export function useRun(id: string | null): RunState {
  const [state, setState] = useState<Tracked>({ ...IDLE, id, status: id ? "loading" : "idle" });

  // A different id resets the state during render, before the effect runs.
  if (state.id !== id) setState({ ...IDLE, id, status: id ? "loading" : "idle" });

  useEffect(() => {
    if (!id) return;
    let live = true;
    let stop = () => {};
    const started = Date.now();
    const update = (fn: (prev: Tracked) => Tracked) => setState((prev) => (prev.id === id ? fn(prev) : prev));

    pact
      .getRun(id)
      .then((run) => {
        if (!live) return;
        if (!run) {
          update((prev) => ({ ...prev, ...IDLE, id: prev.id, status: "missing" }));
          return;
        }
        const activity = (run.activity ?? []).map((a) => ({ message: a.message, t: a.t }));
        update((prev) => ({ ...prev, status: run.status, run, stage: run.stage, activity }));
        if (TERMINAL_STATUSES.has(run.status)) return;

        stop = pact.subscribe(id, (event) => {
          if (!live) return;
          update((prev) => {
            const status = prev.status === "queued" ? "running" : prev.status;
            if (event.type === "stage") return { ...prev, status, stage: event.stage };
            if (event.type === "activity") {
              const t = event.t ?? Date.now() - started;
              if (prev.activity.some((a) => a.message === event.message && a.t === t)) return prev;
              return { ...prev, status, activity: [...prev.activity, { message: event.message, t }] };
            }
            if (event.type === "step") return { ...prev, status, stage: event.step.stage, steps: upsertStep(prev.steps, event.step) };
            if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") {
              return { ...prev, status: event.run.status, stage: event.run.stage, run: event.run };
            }
            return prev;
          });
        });
      })
      .catch((error: unknown) => {
        if (!live) return;
        update((prev) => ({ ...prev, ...IDLE, id: prev.id, status: "error", message: error instanceof Error ? error.message : "The run could not be loaded." }));
      });

    return () => {
      live = false;
      stop();
    };
  }, [id]);

  return state.id === id ? state : { ...IDLE, status: id ? "loading" : "idle" };
}
