import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AttachmentChip } from "@/components/AttachmentChip";
import { ArrowRight, CheckIcon } from "@/components/Icons";
import { Reveal } from "@/components/Reveal";
import { STAGE_LABELS, RUN_STAGES } from "@/lib/pact/types";

export const metadata: Metadata = {
  title: "How it works",
  description: "Input, understand, work, result. How Pact takes a job and performs the work.",
};

const FLOW = ["Input", "Understand", "Work", "Result"];

interface Stage {
  n: string;
  title: string;
  lead: string;
  points: string[];
  figure: ReactNode;
}

const STAGES: Stage[] = [
  {
    n: "01",
    title: "Input",
    lead: "You describe the job in plain words and hand over whatever it needs. There is no template to fill in and no prompt to engineer.",
    points: [
      "Files: documents, spreadsheets, exports, PDFs.",
      "Links: pages, articles, reports, dashboards.",
      "Repositories: point at a GitHub repo by name.",
      "Or nothing at all. An idea is enough to start.",
    ],
    figure: (
      <div className="fig fig--input">
        <p className="fig__task">Compare these four suppliers on price, lead time and risk.</p>
        <div className="fig__chips">
          <AttachmentChip attachment={{ id: "f1", kind: "file", label: "northfield-quote.pdf" }} />
          <AttachmentChip attachment={{ id: "f2", kind: "file", label: "halden-quote.pdf" }} />
          <AttachmentChip attachment={{ id: "f3", kind: "link", label: "corvane.example/pricing" }} />
          <AttachmentChip attachment={{ id: "f4", kind: "github", label: "acme/procurement" }} />
        </div>
      </div>
    ),
  },
  {
    n: "02",
    title: "Understand",
    lead: "Before doing anything, Pact reads what you gave it and works out what the job is really asking for: the goal, the constraints, and what a good result looks like.",
    points: [
      "Reads every attachment, not just the first page.",
      "Separates what matters for this job from what does not.",
      "Notes what is missing and needs to be found.",
    ],
    figure: (
      <dl className="fig fig--brief">
        <div>
          <dt className="label">Goal</dt>
          <dd>Choose a supplier for the first order.</dd>
        </div>
        <div>
          <dt className="label">Context</dt>
          <dd>Four quotations, one pricing page, one repo.</dd>
        </div>
        <div>
          <dt className="label">Missing</dt>
          <dd>Freight cost for one supplier.</dd>
        </div>
        <div>
          <dt className="label">Deliverable</dt>
          <dd>Comparison table and a recommendation.</dd>
        </div>
      </dl>
    ),
  },
  {
    n: "03",
    title: "Work",
    lead: "This is the part most tools skip. Pact researches what it does not know, analyzes what it has, and works through the task step by step until the job is done.",
    points: [
      "Researches to fill the gaps it found.",
      "Analyzes figures, claims and contradictions.",
      "Checks its own draft against the job before returning it.",
    ],
    figure: (
      <ul className="fig fig--log">
        {[
          ["00:04", "Reading four quotations"],
          ["00:19", "Normalising prices to the same order size"],
          ["00:41", "Looking up freight for Northfield"],
          ["01:12", "Comparing terms and penalty clauses"],
          ["01:38", "Drafting the comparison"],
        ].map(([time, line]) => (
          <li key={time}>
            <time>{time}</time>
            <span>{line}</span>
            <CheckIcon width={12} height={12} />
          </li>
        ))}
      </ul>
    ),
  },
  {
    n: "04",
    title: "Result",
    lead: "You get the finished piece of work, not a conversation about it. Structured, sourced, and ready to send, paste, or act on.",
    points: [
      "A clear summary first, detail underneath.",
      "Findings, risks and a recommendation where the job calls for one.",
      "Sources listed, so you can check the work.",
    ],
    figure: (
      <div className="fig fig--doc">
        <p className="label">Result</p>
        <p className="fig__doctitle">Supplier Comparison</p>
        <p className="fig__docbody">
          Of the four suppliers, two are realistic choices. Halden costs about 6% more and delivers in half the time.
        </p>
        <ul className="fig__outline label">
          <li>Side by side</li>
          <li>Key findings</li>
          <li>Important risks</li>
          <li>Recommendation</li>
          <li>Sources</li>
        </ul>
      </div>
    ),
  },
];

// What the app shows while a run is in progress, in the order it shows it.
const RUN_STEPS: Record<(typeof RUN_STAGES)[number], string> = {
  understanding: "Pact reads the job and opens every attachment. It works out the goal, the constraints, and what a good result would look like.",
  analyzing: "It pulls out the figures, claims and open questions in the material, and decides what the result needs to contain.",
  researching: "It fills the gaps: looks up what the context does not cover and cross-checks what it found.",
  working: "It drafts the result, then checks the draft against the job before returning it.",
  done: "The result opens. It stays in Runs, with the context that produced it.",
};

const GOOD_JOB = {
  weak: "Suppliers?",
  better: "Compare these four suppliers on price, lead time and risk, and tell me which one to use for the first order.",
  why: [
    "It names the outcome: a choice, not a list.",
    "It names the criteria: price, lead time, risk.",
    "It names the scope: the first order.",
  ],
};

const CONTEXT_KINDS = [
  {
    title: "Files",
    body: "Documents, spreadsheets, exports and PDFs. The material the job is actually about.",
    preview: "Uploaded to Pact and read on the server: PDF, DOCX, XLSX, CSV, JSON, TXT and MD. Tables get their statistics computed in code.",
  },
  {
    title: "Links",
    body: "Pages, articles, reports and dashboards that hold the facts the job depends on.",
    preview: "Fetched and read when a reader provider is configured; otherwise recorded with the run and reported as unavailable.",
  },
  {
    title: "GitHub",
    body: "A repository by owner and name, for jobs about code, architecture or documentation.",
    preview: "Read through the GitHub API when a token is configured: overview, key files, file tree.",
  },
];

const RESULT_PARTS = [
  { name: "Executive summary", body: "The whole answer in one paragraph. If you read nothing else, read this." },
  { name: "Highlights", body: "Two or three figures that carry the result, each with what it means." },
  { name: "Findings", body: "What Pact found in the material, one point at a time, with the figures that support it." },
  { name: "Important risks", body: "What could make the result wrong, or the decision go badly. Always present, never padded." },
  { name: "Recommendation", body: "What to do, when the job calls for a decision. Written so it can be acted on as is." },
  { name: "Sources", body: "Everything the result drew on, your attachments first, so the work can be checked." },
];

const APP_AREAS = [
  { name: "Home", body: "One input. Describe the job, add context, press Run." },
  { name: "Runs", body: "Every job you have given Pact, with its result. Searchable." },
  { name: "Library", body: "The files, links and repositories you have given Pact, next to the runs that used them." },
  { name: "Integrations", body: "Where context can come from. Files, links and GitHub today; more listed as planned." },
];

const FAQ = [
  {
    q: "Is this running a real agent?",
    a: "Yes. Every run goes through a real run system: a plan, tool calls with hard limits, and a result. How much it can do depends on which providers are configured. Pact chooses the model for the job, or uses the one you pick, and tells you which one did the work.",
  },
  {
    q: "What happens to what I type?",
    a: "It is sent to the Pact server, which keeps the job, the files you attach and the result so you can come back to them. The privacy notice lists exactly what is stored and for how long.",
  },
  {
    q: "Is Pact a chatbot?",
    a: "No. You do not steer it message by message. You describe the job once, give it the context, and get the finished work back.",
  },
  {
    q: "Does it replace my judgment?",
    a: "No. It removes the work between intention and outcome. The decision stays with you, which is why every result shows its findings, its risks and its sources.",
  },
  {
    q: "What kinds of job can it take?",
    a: "Research, documents, data, code, market analysis, comparisons and planning are the categories we show, but they are examples, not a menu. If it is a job and you can give Pact the context, it can take it.",
  },
  {
    q: "Can I get the result out?",
    a: "Yes. Every result can be copied or downloaded as Markdown from the run page.",
  },
];

const ANSWER = [
  "Responds to the question as it was asked.",
  "Works from what it already knows.",
  "Stops at the reply.",
  "Leaves the work with you.",
];

const WORK = [
  "Works toward the outcome you need.",
  "Reads the files, links and repos you provide.",
  "Researches, analyzes, and checks its own output.",
  "Returns a result that is ready to use.",
];

export default function HowItWorksPage() {
  return (
    <>
      <header className="container pagehead">
        <p className="label">How it works</p>
        <h1 className="display-2 pagehead__title">
          Pact doesn’t answer the question. <em>It does the work.</em>
        </h1>
        <p className="lede">
          Most tools hand you a reply and leave the job with you. Pact takes the job: it reads what you give it, works
          out what matters, does the work, and returns something you can use.
        </p>
      </header>

      <section className="container" aria-label="The workflow">
        <ol className="flow">
          {FLOW.map((word, i) => (
            <li key={word} className="flow__item">
              <span className="label">{String(i + 1).padStart(2, "0")}</span>
              <span className="flow__word">{word}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="container stagerows">
        {STAGES.map((stage) => (
          <Reveal key={stage.n} className="stagerow">
            <span className="stagerow__n">{stage.n}</span>
            <div className="stagerow__copy">
              <h2 className="stagerow__title">{stage.title}</h2>
              <p className="stagerow__lead">{stage.lead}</p>
              <ul className="ticks">
                {stage.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
            <div className="stagerow__fig">{stage.figure}</div>
          </Reveal>
        ))}
      </section>

      <section className="section stone">
        <div className="container">
          <Reveal className="section__head">
            <p className="label">A run, step by step</p>
            <h2 className="display-2">
              What you see
              <br />
              while it works.
            </h2>
          </Reveal>
          <ol className="runsteps">
            {RUN_STAGES.map((stage, i) => (
              <li key={stage}>
                <Reveal delay={i * 70} className="runstep">
                  <span className="runstep__n label">{String(i + 1).padStart(2, "0")}</span>
                  <span className="runstep__bar" aria-hidden="true" />
                  <h3 className="runstep__title">{STAGE_LABELS[stage]}</h3>
                  <p className="runstep__body">{RUN_STEPS[stage]}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal className="section__head">
            <p className="label">Writing the job</p>
            <h2 className="display-2">
              Brief it like
              <br />a capable colleague.
            </h2>
          </Reveal>
          <Reveal className="goodjob">
            <div className="goodjob__col goodjob__col--weak">
              <p className="label">Too thin</p>
              <p className="goodjob__text">“{GOOD_JOB.weak}”</p>
              <p className="goodjob__note">Pact can start from this, but it has to guess the outcome, the criteria and the scope.</p>
            </div>
            <div className="goodjob__col">
              <p className="label">Better</p>
              <p className="goodjob__text">“{GOOD_JOB.better}”</p>
              <ul className="ticks">
                {GOOD_JOB.why.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <Reveal className="section__head">
            <p className="label">Context</p>
            <h2 className="display-2">
              What you can
              <br />
              hand over.
            </h2>
          </Reveal>
          <ul className="kinds">
            {CONTEXT_KINDS.map((kind, i) => (
              <li key={kind.title}>
                <Reveal delay={i * 70} className="kind">
                  <h3 className="kind__title">{kind.title}</h3>
                  <p className="kind__body">{kind.body}</p>
                  <p className="kind__preview">
                    <span className="label">Preview</span>
                    {kind.preview}
                  </p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section dark">
        <div className="container">
          <Reveal className="section__head">
            <p className="label">The result</p>
            <h2 className="display-2">
              What comes
              <br />
              back.
            </h2>
          </Reveal>
          <ol className="anatomy">
            {RESULT_PARTS.map((part, i) => (
              <li key={part.name}>
                <Reveal delay={i * 60} className="anatomy__row">
                  <span className="label anatomy__n">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="anatomy__name">{part.name}</h3>
                  <p className="anatomy__body">{part.body}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal className="section__head">
            <p className="label">The app</p>
            <h2 className="display-2">
              Where the work
              <br />
              is kept.
            </h2>
          </Reveal>
          <ul className="areas">
            {APP_AREAS.map((area, i) => (
              <li key={area.name}>
                <Reveal delay={i * 60} className="area">
                  <h3 className="area__name">{area.name}</h3>
                  <p className="area__body">{area.body}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section dark versus">
        <div className="container">
          <Reveal className="section__head">
            <p className="label">The difference</p>
            <h2 className="display-2">
              An answer is where
              <br />
              the work starts.
            </h2>
          </Reveal>
          <Reveal className="versus__grid">
            <div className="versus__col">
              <p className="label">Answering a question</p>
              <ul>
                {ANSWER.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="versus__col versus__col--pact">
              <p className="label">Performing the work</p>
              <ul>
                {WORK.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal className="section__head">
            <p className="label">Questions</p>
            <h2 className="display-2">Straight answers.</h2>
          </Reveal>
          <dl className="faq">
            {FAQ.map((item, i) => (
              <Reveal key={item.q} delay={i * 50} className="faq__item">
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </Reveal>
            ))}
          </dl>
          <Reveal className="section__foot">
            <Link href="/app" className="btn btn--lg btn--accent">
              Give Pact a job
              <ArrowRight />
            </Link>
            <Link href="/docs" className="textlink">
              Read the docs
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
