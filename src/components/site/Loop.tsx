"use client";

import { useEffect, useRef, useState } from "react";
import { HOME } from "@/content/site";
import { cx } from "@/lib/cx";
import { AttachmentChip } from "../AttachmentChip";
import { ArrowRight, CheckIcon } from "../Icons";

// Section 3: the four stages of a run, drawn once as the section scrolls in.

const CONTEXT = [
  { id: "l1", kind: "file" as const, label: "northfield-quote.pdf" },
  { id: "l2", kind: "link" as const, label: "halden.example/terms" },
  { id: "l3", kind: "github" as const, label: "acme/procurement" },
  { id: "l4", kind: "file" as const, label: "orders-2026.csv" },
];

const WORK = [
  "Reading four quotations",
  "Normalising prices to one order size",
  "Looking up freight for Northfield",
  "Checking the draft against the job",
];

const VISUALS = [
  <div key="job" className="lv lv--job">
    <p className="lv__task">
      Find the best supplier for this order.
      <span className="lv__caret" aria-hidden="true" />
    </p>
    <span className="lv__run label">
      Run <ArrowRight width={12} height={12} />
    </span>
  </div>,
  <ul key="context" className="lv lv--context" aria-label="Context">
    {CONTEXT.map((item, i) => (
      <li key={item.id} style={{ "--i": i } as React.CSSProperties}>
        <AttachmentChip attachment={item} />
      </li>
    ))}
  </ul>,
  <ul key="work" className="lv lv--work" aria-label="Work">
    {WORK.map((line, i) => (
      <li key={line} style={{ "--i": i } as React.CSSProperties}>
        <CheckIcon width={11} height={11} />
        {line}
      </li>
    ))}
  </ul>,
  <div key="result" className="lv lv--result">
    <p className="lv__doctitle">Supplier Comparison</p>
    <p className="lv__docline">Of the four suppliers, two are realistic choices. Halden costs about 6% more and delivers in half the time.</p>
    <ul className="lv__outline label">
      <li>Side by side</li>
      <li>Key findings</li>
      <li>Risks</li>
      <li>Recommendation</li>
    </ul>
  </div>,
];

export function Loop() {
  const ref = useRef<HTMLOListElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setOn(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <ol ref={ref} className={cx("loop", on && "is-on")}>
      {HOME.loop.stages.map((stage, i) => (
        <li key={stage.n} className="loop__stage" style={{ "--i": i } as React.CSSProperties}>
          <span className="loop__node" aria-hidden="true" />
          <p className="loop__n label">{stage.n}</p>
          <h3 className="loop__title">{stage.title}</h3>
          <p className="loop__body">{stage.body}</p>
          <div className="loop__visual">{VISUALS[i]}</div>
        </li>
      ))}
    </ol>
  );
}
