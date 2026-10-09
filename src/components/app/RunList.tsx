import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { timeAgo } from "@/lib/pact/format";
import { STATUS_LABELS } from "@/lib/pact/types";
import type { Run } from "@/lib/pact/types";
import { ArrowRight } from "../Icons";
import { ChainIcon } from "../onchain/ChainIcon";

interface RunListProps {
  /** `null` while loading. */
  runs: Run[] | null;
  empty: ReactNode;
  /** Where run pages live; "/app" for the app, the onchain base for Pact Onchain. */
  basePath?: string;
}

export function RunList({ runs, empty, basePath = "/app" }: RunListProps) {
  if (!runs) {
    return (
      <ul className="runs" aria-busy="true" aria-label="Loading runs">
        {[52, 44, 60, 38].map((width) => (
          <li key={width} className="run run--skeleton">
            <span className="skel" style={{ width: 8, height: 8 }} />
            <span className="skel" style={{ width: `${width}%` }} />
            <span className="skel run__time" style={{ width: 56 }} />
          </li>
        ))}
      </ul>
    );
  }

  if (runs.length === 0) return <>{empty}</>;

  return (
    <ul className="runs">
      {runs.map((run) => (
        <li key={run.id}>
          <Link href={`${basePath}/runs/${run.id}`} className="run">
            <span className={cx("run__status", `is-${run.status}`)} aria-hidden="true" />
            <span className="run__title">
              {run.chain && (
                <span className="run__chain" aria-label={run.chain}>
                  <ChainIcon chain={run.chain} size={14} />
                </span>
              )}
              {run.title}
            </span>
            <span className="run__kind">{run.status === "completed" ? run.result?.title : STATUS_LABELS[run.status]}</span>
            <time className="run__time">{timeAgo(run.createdAt)}</time>
            <ArrowRight className="run__arrow" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
