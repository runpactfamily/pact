"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HOME } from "@/content/site";
import { cx } from "@/lib/cx";
import { SAMPLE_PAYMENTS as payments } from "@/content/samples";
import { AttachmentChip } from "../AttachmentChip";
import { ArrowRight, CheckIcon, GitHubIcon, HomeIcon, IntegrationsIcon, LibraryIcon, LinkIcon, Paperclip, PlusIcon, RunsIcon } from "../Icons";
import { Wordmark } from "../Wordmark";

// Section 4: the application, nearly full width, running one job on a loop.
// Scripted rather than live; the point is to show the work happening.

const STAGES = ["Understanding", "Researching", "Analyzing", "Checking", "Preparing result"] as const;
const REPORT = STAGES.length;

const LINES: string[][] = [
  ["Reading the brief and the forecast", "Two markets, one subscription model, two currencies"],
  ["Collecting pricing and method coverage from six providers", "Checking which local payment methods matter in the UK"],
  ["Normalising fees to the projected volume", "Scoring each setup on coverage, cost and integration effort"],
  ["Cross-checking fees against provider documentation"],
  ["Drafting the recommendation"],
];

const STAGE_MS = 1700;
const REPORT_MS = 9000;

const CONTEXT = [
  { id: "p1", kind: "file" as const, label: "expansion-brief.pdf" },
  { id: "p2", kind: "link" as const, label: "Provider pricing pages (6)" },
  { id: "p3", kind: "file" as const, label: "billing-volume-forecast.xlsx" },
];

const NAV = [
  { label: "Home", icon: HomeIcon, active: true },
  { label: "Runs", icon: RunsIcon },
  { label: "Library", icon: LibraryIcon },
  { label: "Integrations", icon: IntegrationsIcon },
];

const RECENT = ["Q3 market analysis", "Analyze financial reports", "Compare suppliers"];

export function AppPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const timer = setTimeout(() => {
        setStill(true);
        setStep(REPORT);
      }, 0);
      return () => clearTimeout(timer);
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || still) return;
    const timer = setTimeout(() => setStep((s) => (s + 1) % (STAGES.length + 1)), step === REPORT ? REPORT_MS : STAGE_MS);
    return () => clearTimeout(timer);
  }, [step, visible, still]);

  const done = step === REPORT;
  const lines = done ? [] : LINES.slice(0, step + 1).flat();

  return (
    <div ref={ref} className={cx("ap", done && "is-done")} style={{ "--ap-ms": `${STAGE_MS}ms` } as React.CSSProperties}>
      <div className="ap__chrome">
        <span className="ap__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="ap__crumb label">Pact / Runs / Payment infrastructure</span>
        <span className="ap__sample label">Sample run</span>
      </div>

      <div className="ap__body">
        <aside className="ap__side" aria-hidden="true">
          <Wordmark />
          <span className="ap__new">
            <PlusIcon width={13} height={13} />
            New run
          </span>
          <ul className="ap__nav">
            {NAV.map(({ label, icon: Glyph, active }) => (
              <li key={label} className={active ? "is-active" : undefined}>
                <Glyph />
                {label}
              </li>
            ))}
          </ul>
          <p className="label ap__recentlabel">Recent</p>
          <ul className="ap__recent">
            {RECENT.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </aside>

        <div className="ap__main">
          <div className="ap__composer">
            <p className="ap__task">{HOME.previewTask}</p>
            <ul className="ap__context" aria-label="Context given">
              {CONTEXT.map((item) => (
                <li key={item.id}>
                  <AttachmentChip attachment={item} />
                </li>
              ))}
            </ul>
            <div className="ap__bar" aria-hidden="true">
              <span className="ap__tools">
                <span>
                  <Paperclip /> Add files
                </span>
                <span>
                  <LinkIcon /> Add links
                </span>
                <span>
                  <GitHubIcon /> GitHub
                </span>
              </span>
              <span className="ap__run label">{done ? "Done" : "Running"}</span>
            </div>
          </div>

          <ol className="ap__rail" aria-label="Progress">
            {STAGES.map((stage, i) => (
              <li
                key={stage}
                className={cx("ap__stage", i < step && "is-past", i === step && "is-now")}
                aria-current={i === step ? "step" : undefined}
              >
                <span className="ap__stagebar" />
                <span className="ap__stagename">{stage}</span>
              </li>
            ))}
          </ol>

          <div className="ap__stream">
            {!done && (
              <>
                <p className="ap__now" key={step}>
                  {STAGES[step]}
                </p>
                <ul className="ap__log" aria-live="polite">
                  {lines.map((line, i) => (
                    <li key={line} className={cx(i === lines.length - 1 && "is-live")}>
                      <span className="ap__tick">
                        <CheckIcon width={11} height={11} />
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
                <div className="ap__ghost" aria-hidden="true">
                  <span className="label">Preparing result</span>
                  {[72, 100, 88, 56].map((w) => (
                    <span key={w} className="skel" style={{ width: `${w}%` }} />
                  ))}
                </div>
              </>
            )}

            {done && (
              <article className="ap__report" aria-live="polite">
                <p className="label ap__reportmeta">
                  <span className="ap__done">
                    <CheckIcon width={12} height={12} /> Done
                  </span>
                  <span>4 sources</span>
                </p>
                <h3 className="ap__reporttitle">{payments.title}</h3>
                <p className="ap__summary">{payments.summary}</p>
                <dl className="ap__highlights">
                  {payments.highlights?.map((h) => (
                    <div key={h.label}>
                      <dd>{h.value}</dd>
                      <dt>{h.label}</dt>
                    </div>
                  ))}
                </dl>
                <section className="ap__section">
                  <h4 className="label">{payments.sections[0].heading}</h4>
                  <ul>
                    {payments.sections[0].items?.slice(0, 2).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              </article>
            )}
          </div>
          <div className="ap__fade" aria-hidden="true" />
        </div>
      </div>

      <div className="ap__foot">
        <p>This is a sample run. Give Pact one of your own.</p>
        <Link href={{ pathname: "/app", query: { task: HOME.previewTask } }} className="btn btn--sm">
          Try this job
          <ArrowRight />
        </Link>
      </div>
    </div>
  );
}
