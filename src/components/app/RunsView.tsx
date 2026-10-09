"use client";

import Link from "next/link";
import { useState } from "react";
import { useRuns } from "@/lib/pact/hooks";
import type { RunSurface } from "@/lib/pact/types";
import { EmptyState } from "../EmptyState";
import { ArrowRight, SearchIcon } from "../Icons";
import { RunList } from "./RunList";

interface RunsViewProps {
  surface?: RunSurface;
  basePath?: string;
  title?: string;
  sub?: string;
}

export function RunsView({ surface = "app", basePath = "/app", title = "Runs", sub = "Every job you have given Pact, with its result." }: RunsViewProps) {
  const { runs, error } = useRuns(surface);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const visible =
    runs && needle
      ? runs.filter((run) => `${run.title} ${run.task} ${run.result?.title ?? ""}`.toLowerCase().includes(needle))
      : runs;

  return (
    <div className="view">
      <header className="viewhead">
        <div>
          <h1 className="viewhead__title">{title}</h1>
          <p className="viewhead__sub">{sub}</p>
        </div>
        <label className="search">
          <SearchIcon />
          <span className="sr-only">Search runs</span>
          <input
            type="search"
            placeholder="Search runs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </header>

      <RunList
        runs={visible}
        basePath={basePath}
        empty={
          error ? (
            <EmptyState title="Runs couldn’t be loaded" body={error} />
          ) : needle ? (
            <EmptyState
              title="No runs match"
              body={`Nothing found for “${query.trim()}”. Try a word from the job you gave.`}
              action={
                <button type="button" className="btn btn--ghost" onClick={() => setQuery("")}>
                  Clear search
                </button>
              }
            />
          ) : (
            <EmptyState
              title="No runs yet"
              body="Give Pact a job and it will appear here with its result."
              action={
                <Link href={basePath || "/"} className="btn">
                  New run
                  <ArrowRight />
                </Link>
              }
            />
          )
        }
      />
    </div>
  );
}
