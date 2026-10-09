import { cx } from "@/lib/cx";
import { clock } from "@/lib/pact/format";
import type { ActivityLine } from "@/lib/pact/hooks";
import { RUN_STAGES, STAGE_LABELS } from "@/lib/pact/types";
import type { Run, RunStage, RunStepInfo } from "@/lib/pact/types";
import { CheckIcon, CloseIcon } from "../Icons";

interface RunProgressProps {
  stage: RunStage;
  activity: ActivityLine[];
  /** Real steps from the run stream; the timeline is built from these only. */
  steps?: RunStepInfo[];
  run?: Run | null;
  /** The run has just ended; the timeline settles before the result takes over. */
  finished?: boolean;
  variant?: "full" | "compact";
}

/** What a step is doing, in the user's terms. Derived from the real tool and label, never invented. */
export function stepLabel(step: RunStepInfo): string {
  if (step.kind === "plan") return step.status === "running" ? "Understanding the job" : "Understood the job";
  if (step.kind === "evaluate") return step.status === "running" ? "Checking what was found" : "Checked what was found";
  if (step.kind === "synthesize") return step.status === "running" ? "Preparing the result" : step.status === "completed" ? "Result ready" : "Preparing the result";
  const done = step.status === "completed";
  switch (step.tool) {
    case "web_search":
      return done ? "Searched the web" : "Searching the web";
    case "web_read":
      return `${done ? "Read" : "Reading"} ${step.name.replace(/^Read\s+/i, "")}`;
    case "web_crawl":
      return `${done ? "Explored" : "Exploring"} ${step.name.replace(/^Explore\s+/i, "")}`;
    case "github":
      return `${done ? "Analyzed" : "Analyzing"} GitHub repository ${step.name.replace(/^Read\s+/i, "")}`;
    case "file_read":
      return `${done ? "Read" : "Reading"} ${step.name.replace(/^Read\s+/i, "")}`;
    case "data_analyze":
      return `${done ? "Analyzed" : "Analyzing"} ${step.name.replace(/^Analyse\s+/i, "")}`;
    case "calculator":
      return done ? "Calculated" : "Calculating";
    default:
      return step.name;
  }
}

export function RunProgress({ stage, activity, steps = [], run, finished = false, variant = "full" }: RunProgressProps) {
  const index = finished ? RUN_STAGES.length - 1 : RUN_STAGES.indexOf(stage);
  const lines = activity.slice(variant === "full" ? -5 : -3);
  const current = steps.find((s) => s.status === "running");
  const headline = finished ? "Complete" : current ? stepLabel(current) : STAGE_LABELS[stage];
  const working = run?.llm?.label;

  return (
    <div className={cx("progress", `progress--${variant}`, finished && "is-finished")} role="status" aria-live="polite">
      <div className="progress__head">
        <div>
          <p className="progress__now" key={headline}>
            {headline}
          </p>
          {working && (
            <p className="progress__model label">
              Working with <strong>{working}</strong>
            </p>
          )}
        </div>
        <p className="progress__count label">
          {String(index + 1).padStart(2, "0")} / {String(RUN_STAGES.length).padStart(2, "0")}
        </p>
      </div>

      <ol className="progress__stages">
        {RUN_STAGES.map((item, i) => (
          <li
            key={item}
            className={cx("stage", i < index && "is-done", i === index && !finished && "is-active", i === index && finished && "is-done")}
            aria-current={i === index ? "step" : undefined}
          >
            <span className="stage__bar" />
            <span className="stage__label">{STAGE_LABELS[item]}</span>
          </li>
        ))}
      </ol>

      {steps.length > 0 && (
        <ol className="timeline" aria-label="Steps">
          {steps.map((step) => (
            <li key={step.id} className={cx("timeline__step", `is-${step.status}`)}>
              <span className="timeline__mark" aria-hidden="true">
                {step.status === "completed" && <CheckIcon width={10} height={10} />}
                {(step.status === "failed" || step.status === "skipped") && <CloseIcon width={10} height={10} />}
              </span>
              <span className="timeline__label">{stepLabel(step)}</span>
              {step.status === "failed" && step.error && <span className="timeline__note">{step.error.message}</span>}
              {step.status === "skipped" && <span className="timeline__note">skipped</span>}
              {step.startedAt && step.completedAt && <span className="timeline__time label">{((step.completedAt - step.startedAt) / 1000).toFixed(1)}s</span>}
            </li>
          ))}
        </ol>
      )}

      {!finished && (
        <ul className="log" aria-label="Activity">
          {lines.map((line) => (
            <li key={`${line.t}-${line.message}`} className="log__line">
              <time>{clock(line.t)}</time>
              <span>{line.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
