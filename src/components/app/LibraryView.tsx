"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cx } from "@/lib/cx";
import { timeAgo } from "@/lib/pact/format";
import { useRuns } from "@/lib/pact/hooks";
import type { AttachmentKind } from "@/lib/pact/types";
import { EmptyState } from "../EmptyState";
import { ArrowRight, FileIcon, GitHubIcon, LinkIcon } from "../Icons";

type Tab = "all" | AttachmentKind;

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "file", label: "Files" },
  { id: "link", label: "Links" },
  { id: "github", label: "Repositories" },
];

const ICONS = { file: FileIcon, link: LinkIcon, github: GitHubIcon };

const EMPTY: Record<Tab, { title: string; body: string }> = {
  all: { title: "Your library is empty", body: "Files, links and repositories you give Pact are kept here, next to the runs that used them." },
  file: { title: "No files yet", body: "Files you attach to a job are kept here." },
  link: { title: "No links yet", body: "Add a link to a job with Add links and it will be kept here." },
  github: { title: "No repositories yet", body: "Point a job at a GitHub repository and it will be kept here." },
};

export function LibraryView() {
  const { runs } = useRuns();
  const [tab, setTab] = useState<Tab>("all");

  const items = useMemo(
    () =>
      (runs ?? []).flatMap((run) =>
        run.attachments.map((attachment) => ({ attachment, runId: run.id, runTitle: run.title, at: run.createdAt })),
      ),
    [runs],
  );
  const visible = tab === "all" ? items : items.filter((item) => item.attachment.kind === tab);

  return (
    <div className="view">
      <header className="viewhead">
        <div>
          <h1 className="viewhead__title">Library</h1>
          <p className="viewhead__sub">The context you have given Pact, ready to reuse.</p>
        </div>
      </header>

      <div className="tabs" role="group" aria-label="Filter library">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cx("filter", tab === item.id && "is-active")}
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!runs ? (
        <ul className="runs" aria-busy="true" aria-label="Loading library">
          {[46, 58, 40].map((width) => (
            <li key={width} className="run run--skeleton">
              <span className="skel" style={{ width: 14, height: 14 }} />
              <span className="skel" style={{ width: `${width}%` }} />
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <EmptyState
          {...EMPTY[tab]}
          action={
            <Link href="/app" className="btn">
              New run
              <ArrowRight />
            </Link>
          }
        />
      ) : (
        <ul className="runs">
          {visible.map(({ attachment, runId, runTitle, at }) => {
            const Glyph = ICONS[attachment.kind];
            return (
              <li key={`${runId}-${attachment.id}`}>
                <Link href={`/app/runs/${runId}`} className="run run--asset">
                  <Glyph className="run__glyph" />
                  <span className="run__title">{attachment.label}</span>
                  <span className="run__kind">Used in {runTitle}</span>
                  <time className="run__time">{timeAgo(at)}</time>
                  <ArrowRight className="run__arrow" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
