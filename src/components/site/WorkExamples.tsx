import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { SAMPLE_CODE, SAMPLE_COMPARE, SAMPLE_FINANCIAL, SAMPLE_MARKET, SAMPLE_SUMMARY } from "@/content/samples";
import type { ResultTable } from "@/lib/pact/types";
import { ArrowRight } from "../Icons";

// Section 5: real jobs with a glimpse of what a result looks like, laid out
// like a magazine spread. Previews are illustrative copy from content/samples.

function MiniTable({ table, rows = 4 }: { table: ResultTable; rows?: number }) {
  return (
    <table className="mini">
      <thead>
        <tr>
          {table.columns.map((c, i) => (
            <th key={`${c}-${i}`}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.slice(0, rows).map((row) => (
          <tr key={row.join("|")}>
            {row.map((cell, i) => (i === 0 ? <th key={i}>{cell}</th> : <td key={i}>{cell}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface Example {
  job: string;
  returns: string;
  size: "wide" | "half" | "wide-flip";
  preview: ReactNode;
}

const compareTable = SAMPLE_COMPARE.sections[0].table!;
const codeTable = SAMPLE_CODE.sections[1].table!;
const financeTable = SAMPLE_FINANCIAL.sections[2].table!;

const EXAMPLES: Example[] = [
  {
    job: "Find the best supplier for this order.",
    returns: "Comparison table and a recommendation",
    size: "wide",
    preview: (
      <div className="peek">
        <p className="peek__title">Supplier Comparison</p>
        <MiniTable table={compareTable} />
        <p className="peek__rec">{SAMPLE_COMPARE.sections[3].body?.[0]}</p>
      </div>
    ),
  },
  {
    job: "Understand this entire codebase.",
    returns: "Flow overview with file references",
    size: "half",
    preview: (
      <div className="peek">
        <p className="peek__title">Authentication Flow Overview</p>
        <MiniTable table={codeTable} />
      </div>
    ),
  },
  {
    job: "Turn these documents into a decision.",
    returns: "Summary, insights, and where the documents disagree",
    size: "half",
    preview: (
      <div className="peek peek--decision">
        <p className="peek__title">Summary and Key Insights</p>
        <p className="label peek__label">Recommendation</p>
        <p className="peek__rec">{SAMPLE_SUMMARY.sections[3].body?.[0]}</p>
      </div>
    ),
  },
  {
    job: "Research this market and tell me what matters.",
    returns: "Market research report with sources",
    size: "wide-flip",
    preview: (
      <div className="peek">
        <p className="peek__title">Market Research Report</p>
        <dl className="peek__stats">
          {SAMPLE_MARKET.highlights?.map((h) => (
            <div key={h.label}>
              <dd>{h.value}</dd>
              <dt>{h.label}</dt>
            </div>
          ))}
        </dl>
        <p className="peek__rec">{SAMPLE_MARKET.summary.split(". ").slice(0, 2).join(". ")}.</p>
      </div>
    ),
  },
  {
    job: "Analyze these numbers and explain what changed.",
    returns: "What changed, why, and what to do",
    size: "wide",
    preview: (
      <div className="peek">
        <p className="peek__title">Financial Report Analysis</p>
        <MiniTable table={financeTable} />
      </div>
    ),
  },
];

export function WorkExamples() {
  return (
    <ul className="spread">
      {EXAMPLES.map((example, i) => (
        <li key={example.job} className={cx("spread__item", `spread__item--${example.size}`)}>
          <Link href={{ pathname: "/app", query: { task: example.job } }} className="piece">
            <div className="piece__copy">
              <span className="label piece__n">{String(i + 1).padStart(2, "0")}</span>
              <p className="piece__job">“{example.job}”</p>
              <p className="piece__returns">
                <span className="label">Returns</span>
                {example.returns}
              </p>
              <span className="piece__go">
                Give Pact this job
                <ArrowRight />
              </span>
            </div>
            <div className="piece__preview" aria-hidden="true">
              {example.preview}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
