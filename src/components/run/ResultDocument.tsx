"use client";

import { useState } from "react";
import { cx } from "@/lib/cx";
import { formatDuration, toMarkdown } from "@/lib/pact/format";
import type { ResultSection, Run } from "@/lib/pact/types";
import { CheckIcon, CopyIcon, DownloadIcon } from "../Icons";

interface ResultDocumentProps {
  run: Run;
  /** "preview" shows the opening of the result, for the landing page. */
  variant?: "full" | "preview";
}

function Section({ section }: { section: ResultSection }) {
  const List = section.ordered ? "ol" : "ul";
  return (
    <section className={cx("doc__section", section.tone && `doc__section--${section.tone}`)}>
      <h3 className="doc__heading label">{section.heading}</h3>
      <div className="doc__content">
        {section.body?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        {section.items && (
          <List className={cx("doc__list", section.ordered && "doc__list--ordered")}>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </List>
        )}
        {section.table && (
          <div className="doc__tablewrap">
            <table className="doc__table">
              <thead>
                <tr>
                  {section.table.columns.map((column, i) => (
                    <th key={`${column}-${i}`} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.table.rows.map((row) => (
                  <tr key={row.join("|")}>
                    {row.map((cell, i) => (i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export function ResultDocument({ run, variant = "full" }: ResultDocumentProps) {
  const [copied, setCopied] = useState(false);
  const result = run.result;
  if (!result) return null;

  const sections = variant === "preview" ? result.sections.slice(0, 1) : result.sections;

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(toMarkdown(result));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure context or permission): nothing to confirm.
    }
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([toMarkdown(result)], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <article className={cx("doc", `doc--${variant}`)}>
      <header className="doc__head">
        <div className="doc__meta label">
          <span className="doc__done">
            <CheckIcon width={12} height={12} />
            Done
          </span>
          {run.llm?.label && <span className="doc__model">{run.llm.label}</span>}
          {run.durationMs !== undefined && <span>{formatDuration(run.durationMs)}</span>}
          <span>
            {result.sources.length} {result.sources.length === 1 ? "source" : "sources"}
          </span>
        </div>
        <h2 className="doc__title">{result.title}</h2>
        {variant === "full" && (
          <div className="doc__actions">
            <button type="button" className="btn btn--sm btn--ghost" onClick={copy}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={download}>
              <DownloadIcon />
              Download .md
            </button>
          </div>
        )}
      </header>

      <section className="doc__section doc__section--summary">
        <h3 className="doc__heading label">Executive summary</h3>
        <div className="doc__content">
          <p className="doc__summary">{result.summary}</p>
        </div>
      </section>

      {result.highlights && (
        <dl className="doc__highlights">
          {result.highlights.map((highlight) => (
            <div key={highlight.label} className="doc__highlight">
              <dt>{highlight.label}</dt>
              <dd>{highlight.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {sections.map((section) => (
        <Section key={section.heading} section={section} />
      ))}

      {variant === "full" && (
        <section className="doc__section">
          <h3 className="doc__heading label">Sources</h3>
          <div className="doc__content">
            <ol className="doc__sources">
              {result.sources.map((source, i) => (
                <li key={`${source.label}-${i}`}>
                  <span className="doc__sourcenum">{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    {source.label}
                    {source.detail && <em>{source.detail}</em>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </article>
  );
}
