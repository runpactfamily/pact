import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "@/components/Icons";
import { ChainIcon } from "@/components/onchain/ChainIcon";
import { DocsToc, type DocsSection } from "@/components/site/DocsToc";
import { DOCS_URL, ONCHAIN_URL } from "@/content/site";
import type { ChainId } from "@/lib/pact/types";
import { STAGE_LABELS, RUN_STAGES } from "@/lib/pact/types";

export const metadata: Metadata = {
  title: "Docs",
  description: "What Pact and Pact Onchain are, how to write a job, what each chain covers, and what the preview can do today.",
  alternates: { canonical: DOCS_URL },
};

const SECTIONS: DocsSection[] = [
  { group: "Pact", id: "introduction", title: "Introduction" },
  { group: "Pact", id: "how-pact-works", title: "The four stages" },
  { group: "Pact", id: "getting-started", title: "Getting started" },
  { group: "Pact", id: "writing-a-job", title: "Writing a job" },
  { group: "Pact", id: "context", title: "Context" },
  { group: "Pact", id: "runs", title: "Runs and results" },
  { group: "Pact", id: "the-app", title: "The app" },
  { group: "Pact", id: "examples", title: "Examples" },
  { group: "Pact Onchain", id: "onchain", title: "Overview" },
  { group: "Pact Onchain", id: "onchain-start", title: "Getting started" },
  { group: "Pact Onchain", id: "onchain-chains", title: "Chains and coverage" },
  { group: "Pact Onchain", id: "onchain-jobs", title: "What you can ask" },
  { group: "Pact Onchain", id: "onchain-writing", title: "Writing an onchain job" },
  { group: "Pact Onchain", id: "onchain-results", title: "Reading the result" },
  { group: "Pact Onchain", id: "onchain-limits", title: "Limits" },
  { group: "Reference", id: "preview-status", title: "Preview status" },
  { group: "Reference", id: "faq", title: "FAQ" },
];

const onchainJob = (chain: ChainId, task: string) => `${ONCHAIN_URL}/?chain=${chain}&task=${encodeURIComponent(task)}`;

const CHAINS: { id: ChainId; name: string; coverage: "Full" | "Partial"; body: string }[] = [
  {
    id: "robinhood",
    name: "Robinhood Chain",
    coverage: "Partial",
    body: "Tokens, tokenized stocks, trending and new tokens, screens, candles, large trades, wallets, transactions and DeFi totals. Market data comes from a single indexer, and there is no honeypot or tax check: risk screens here cover contract verification, holder concentration and scam flags.",
  },
  {
    id: "base",
    name: "Base",
    coverage: "Full",
    body: "Everything in this guide, including honeypot and tax checks, liquidity locks, and the token approvals a wallet has granted with the risk of each spender.",
  },
  {
    id: "bnb",
    name: "BNB Chain",
    coverage: "Full",
    body: "Everything in this guide, including honeypot and tax checks, liquidity locks, and the token approvals a wallet has granted with the risk of each spender.",
  },
  {
    id: "solana",
    name: "Solana",
    coverage: "Full",
    body: "Everything in this guide except token approvals, which Solana does not have. Adds mint and freeze authority, a verification and organic-activity score, priced wallet holdings, and launchpad stages such as Pump.fun graduation.",
  },
];

const ONCHAIN_JOBS: { title: string; body: string; chain: ChainId; task: string }[] = [
  {
    title: "Token analysis",
    body: "Identity by symbol or address, price, market cap, liquidity across pools, 24h volume, age, supply, holders and the share held by the top ten wallets. Where the token is listed more widely: all-time high, market cap rank and exchange listings.",
    chain: "bnb",
    task: "Due diligence on $CAKE on BNB Chain: identity, security, volume and buy/sell pressure.",
  },
  {
    title: "Security",
    body: "Honeypot and buy/sell tax checks, mintable supply, proxy and ownership, blacklist and pause functions, holder concentration, liquidity locks and contract verification. On Solana, mint and freeze authority.",
    chain: "base",
    task: "Is $BRETT on Base safe to trade? Check the contract, liquidity locks and holder concentration.",
  },
  {
    title: "Price history",
    body: "Daily candles up to a year, hourly candles for the last days, or minute candles for today: change over the window, the high and low with dates, drawdown from the high, volatility and the volume trend.",
    chain: "bnb",
    task: "Price history of $CAKE over the last year: distance from the all-time high, volatility and volume trend.",
  },
  {
    title: "Volume tracking",
    body: "Volume, price change and the buy/sell split over 5 minutes, 1 hour, 6 hours and 24 hours across every pool, volume against liquidity, and the pace of the last hour.",
    chain: "solana",
    task: "What is moving on Solana right now, and where is the volume concentrated?",
  },
  {
    title: "Large trades",
    body: "Trades above a size you name in the last 24 hours: buys against sells, net flow, the biggest trades with their transactions, and the addresses with the largest net change.",
    chain: "solana",
    task: "Whale activity in $JUP today: trades above $10k, net flow, and who is buying.",
  },
  {
    title: "Comparisons",
    body: "Two to six tokens side by side in one table: price, 24h change, market cap, liquidity, volume, buy share, age and a risk screen for each.",
    chain: "base",
    task: "Compare $BRETT, $DEGEN and $TOSHI on Base: liquidity, volume, buy pressure and risk.",
  },
  {
    title: "Market intelligence",
    body: "What is trending on a chain, the top pools by volume, tokens paying for promotion, gas and the latest block, the chain's DeFi total and its DEX volume.",
    chain: "robinhood",
    task: "What is trending on Robinhood Chain right now, with volume, liquidity and holders for each token?",
  },
  {
    title: "New tokens",
    body: "Tokens launched within a window you choose, above a liquidity floor, ranked by volume and screened for risk before they reach the result.",
    chain: "base",
    task: "Newest tokens on Base in the last 12 hours with at least $20k liquidity, screened for risk.",
  },
  {
    title: "Token screens",
    body: "Screen a chain by liquidity, volume, age, holders, top-ten share, market cap and launchpad stage, ranked by trending, volume, holders, 24h change, newest, liquidity, market cap or graduation progress. Each row carries the shares held by snipers, insiders and the developer.",
    chain: "solana",
    task: "Pump.fun tokens on Solana closest to graduation right now, with sniper and developer shares.",
  },
  {
    title: "DeFi",
    body: "A chain's total value locked with its 7 and 30 day change, stablecoin supply, the largest protocols, and the best yields above a size floor, stablecoin only if you ask.",
    chain: "base",
    task: "Largest DeFi protocols on Base by TVL, stablecoin supply, and the best stable yields above $1M TVL.",
  },
  {
    title: "Wallets",
    body: "Native and token balances, priced where a price exists, recent transactions with their methods and counterparties, and whether the address is a wallet or a contract. Safety checks cover addresses flagged for phishing, scams, sanctions or mixers; on Base and BNB Chain they also list risky token approvals and which to revoke.",
    chain: "base",
    task: "What does this wallet hold on Base, and does it have risky token approvals? (paste a wallet address)",
  },
  {
    title: "Transactions",
    body: "Any transaction hash or Solana signature explained: status, the parties, the decoded method, value, fee and token transfers; on Solana, the instructions and balance changes.",
    chain: "robinhood",
    task: "Explain this Robinhood Chain transaction: (paste a transaction hash)",
  },
];

const STAGE_NOTES: Record<(typeof RUN_STAGES)[number], string> = {
  understanding: "Reading the job and every attachment; working out the goal and what a good result looks like.",
  analyzing: "Pulling out figures, claims and open questions; deciding what the result needs.",
  researching: "Filling the gaps the context does not cover; cross-checking what was found.",
  working: "Drafting the result and checking it against the job.",
  done: "The result opens and is kept under Runs.",
};

const EXAMPLES = [
  {
    task: "Analyze these documents and create a summary with the key insights.",
    context: "Six PDFs",
    result: "A summary, the insights that recur across the documents, and where they disagree.",
  },
  {
    task: "Read this repository and explain how authentication works.",
    context: "One GitHub repository",
    result: "A step-by-step flow, the files that carry it, weak points, and a recommendation.",
  },
  {
    task: "Compare these four suppliers on price, lead time and risk.",
    context: "Four quotations",
    result: "A side-by-side table, the findings behind it, and which supplier to choose.",
  },
  {
    task: "Research the best payment infrastructure for a SaaS expanding into the UK and the US.",
    context: "One brief, provider pricing pages, one forecast",
    result: "A recommendation with what it costs, the risks, and the setup to use.",
  },
  {
    task: "Turn this objective into a twelve-week plan with owners and milestones.",
    context: "One brief",
    result: "A phased plan, first actions, and the risks to watch.",
  },
];

const WORKS = [
  "Describe a job, add files, links and a GitHub repository, and run it.",
  "A real run: a plan, tool calls with hard limits, progress as it happens, and a structured result.",
  "Files are uploaded and read on the server: PDF, DOCX, XLSX, CSV, JSON, TXT and MD, with table statistics computed in code.",
  "Web search, page reading and GitHub run when their providers are configured; otherwise they are reported as unavailable, not faked.",
  "Find past runs under Runs, search them, and reopen any result. Copy a result or download it as Markdown.",
  "Cancel a run while it is in progress.",
  "Pact Onchain on four chains: token analysis, security screens, price history, volume, large trades, comparisons, new tokens, screens, DeFi, wallets and transactions.",
];

const NOT_YET = [
  "Running without a language model. If no configured model responds, the run fails with a clear error rather than producing a substitute result.",
  "Accounts. Runs and files are scoped to a per-browser id, not a login.",
  "Onchain actions. Pact Onchain reads public data; it does not connect to a wallet, sign, trade or send anything.",
  "Chains beyond the four listed, and honeypot or tax checks on Robinhood Chain.",
  "Integrations beyond the composer. Cloud storage, team workspaces and databases are listed as planned, not available.",
];

const FAQ = [
  {
    q: "Where does my data go?",
    a: "To the Pact server. The job, the files you attach, the progress and the result are stored there so you can come back to them. Links and repositories are only fetched when a provider is configured. See the privacy notice for the full list.",
  },
  {
    q: "Which model works on my job?",
    a: "Auto picks by the job: light tasks go to a fast model, heavy research, code and multi-source analysis go to Claude, with Gemini and open-weight models as fallbacks. You can also pick a model yourself in the composer. The run page and the result show which model actually did the work.",
  },
  {
    q: "Why was a step skipped?",
    a: "Because the tool it needed has no provider configured, or the run reached its step limit. Skipped steps are listed in the result’s Limitations section and in the run’s steps.",
  },
  {
    q: "Can I delete a run?",
    a: "Not from the interface yet. Runs are stored on the server; deletion is planned alongside accounts.",
  },
  {
    q: "Do I need to connect a wallet to use Pact Onchain?",
    a: "No. It reads public data only. It never asks for a wallet connection, a seed phrase or a signature, and it cannot move funds.",
  },
  {
    q: "Is a clean security screen a guarantee?",
    a: "No. It means the checks that ran found no flags. Contracts can change, checks can miss things, and a token with a clean screen can still lose its value. Nothing Pact Onchain returns is investment advice.",
  },
  {
    q: "Why does Robinhood Chain say partial coverage?",
    a: "Its market data comes from one indexer, so figures there cannot be cross-checked against a second source, and honeypot and tax checks are not available for it yet. Results say so where it matters.",
  },
  {
    q: "Does it work on a phone?",
    a: "Yes. The app has a top bar and a tab bar on small screens, and results are laid out for a narrow column.",
  },
];

export default function DocsPage() {
  return (
    <div className="container docs">
      <aside className="docs__aside">
        <Suspense fallback={null}>
          <DocsToc sections={SECTIONS} />
        </Suspense>
      </aside>

      <article className="docs__body prose">
        <header className="docs__head">
          <p className="label">Documentation</p>
          <h1 className="display-2">Pact docs</h1>
          <p className="lede">
            One guide for both surfaces: Pact for everyday work, and Pact Onchain for public blockchain data. How to give
            each a job, and what the preview can do today.
          </p>
          <div className="docs__jump">
            <a href="#introduction" className="docs__jumpcard">
              <span className="label">Part one</span>
              <strong>Pact</strong>
              <span>Files, links, repositories and research, returned as finished work.</span>
            </a>
            <a href="#onchain" className="docs__jumpcard">
              <span className="label">Part two</span>
              <strong>Pact Onchain</strong>
              <span>Tokens, wallets, transactions and markets on four chains.</span>
            </a>
          </div>
        </header>

        <section id="introduction">
          <p className="label docs__part">Pact</p>
          <h2>Introduction</h2>
          <p>
            Pact is an autonomous work agent. You give it a job and any relevant context. Pact understands the context,
            works through the task, and returns a useful result.
          </p>
          <p>
            It is not a chat window. You do not steer it message by message. You describe what you need done, and you
            get the finished piece of work back: a structured document with a summary, findings, risks, a
            recommendation where one is called for, and the sources it drew on.
          </p>
          <div className="note">
            <p className="label">Preview</p>
            <p>
              This release is a preview. Runs are real, with real limits and real tool calls; how much they can do
              depends on which providers are configured. The <a href="#preview-status">preview status</a>{" "}
              section lists exactly what works.
            </p>
          </div>
        </section>

        <section id="how-pact-works">
          <h2>The four stages</h2>
          <p>Every job moves through the same four stages. This is the short version; the How it works page is the long one.</p>
          <ol className="prose__steps">
            <li>
              <span className="label">Input</span>
              <p>You describe the job and attach what it needs: files, links, a repository, data, or just an idea.</p>
            </li>
            <li>
              <span className="label">Understand</span>
              <p>Pact reads the context and works out the goal, the constraints, and what is missing.</p>
            </li>
            <li>
              <span className="label">Work</span>
              <p>It researches, analyzes, and works through the task, checking the result against the job.</p>
            </li>
            <li>
              <span className="label">Result</span>
              <p>You receive clear, structured output with its sources, ready to use.</p>
            </li>
          </ol>
          <p>
            <Link href="/how-it-works" className="textlink">
              See each stage with an example job
              <ArrowRight />
            </Link>
          </p>
        </section>

        <section id="getting-started">
          <h2>Getting started</h2>
          <ol className="prose__list">
            <li>
              Open the <Link href="/app">app</Link>. It starts on one question: what do you need done?
            </li>
            <li>Write the job the way you would brief a capable colleague. Say what you want back.</li>
            <li>Add context with Add files, Add links, or GitHub. More relevant context gives a better result.</li>
            <li>
              Press Run, or press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> in the input. Pact works through the stages and opens
              the result when it is done.
            </li>
            <li>Find past jobs and their results under Runs. Copy a result or download it as Markdown.</li>
          </ol>
        </section>

        <section id="writing-a-job">
          <h2>Writing a job</h2>
          <p>A good job states the outcome, the criteria, and the scope. Pact can start from less, but it then has to guess.</p>
          <div className="prose__compare">
            <div>
              <p className="label">Too thin</p>
              <p className="prose__task">“Suppliers?”</p>
            </div>
            <div>
              <p className="label">Better</p>
              <p className="prose__task">
                “Compare these four suppliers on price, lead time and risk, and tell me which one to use for the first
                order.”
              </p>
            </div>
          </div>
          <ul className="prose__bullets">
            <li>
              <strong>Name the outcome.</strong> A decision, a summary, a plan, an explanation. Say which.
            </li>
            <li>
              <strong>Name the criteria.</strong> If price matters more than speed, say so.
            </li>
            <li>
              <strong>Name the scope.</strong> This order, this quarter, this part of the codebase.
            </li>
            <li>
              <strong>Say what to return.</strong> A table, a one-page brief, a ranked list. Pact will pick a sensible
              shape if you do not.
            </li>
          </ul>
        </section>

        <section id="context">
          <h2>Context</h2>
          <p>Context is everything you hand over with the job. Three kinds can be added from the composer.</p>
          <dl className="prose__defs">
            <div>
              <dt>Files</dt>
              <dd>
                Documents, spreadsheets, exports, PDFs. Pick as many as the job needs. Each file is uploaded, checked,
                and read on the server; tables get their statistics computed in code.
              </dd>
            </div>
            <div>
              <dt>Links</dt>
              <dd>
                Paste a URL and press Enter or Add. The host and path are shown as a chip. The page is fetched and read
                when a reader provider is configured; otherwise the step is reported as unavailable.
              </dd>
            </div>
            <div>
              <dt>GitHub</dt>
              <dd>
                Enter a repository as <code>owner/repository</code>, or paste its GitHub URL. With a GitHub token
                configured, Pact reads the overview, key files and file tree through the API.
              </dd>
            </div>
          </dl>
          <p>
            Every piece of context you add is listed under <Link href="/app/library">Library</Link>, next to the run that
            used it, and appears first in that result&apos;s sources.
          </p>
        </section>

        <section id="runs">
          <h2>Runs and results</h2>
          <p>While a job is running, the app shows which stage it is in.</p>
          <dl className="prose__defs prose__defs--tight">
            {RUN_STAGES.map((stage) => (
              <div key={stage}>
                <dt>{STAGE_LABELS[stage]}</dt>
                <dd>{STAGE_NOTES[stage]}</dd>
              </div>
            ))}
          </dl>
          <p>A finished result has a fixed shape, so you always know where to look.</p>
          <ul className="prose__bullets">
            <li>
              <strong>Executive summary.</strong> The whole answer in one paragraph.
            </li>
            <li>
              <strong>Highlights.</strong> Two or three figures that carry the result.
            </li>
            <li>
              <strong>Findings and observations.</strong> What was found, point by point.
            </li>
            <li>
              <strong>Important risks.</strong> What could make the result wrong or the decision go badly.
            </li>
            <li>
              <strong>Recommendation.</strong> What to do, when the job calls for a decision.
            </li>
            <li>
              <strong>Sources.</strong> Your attachments first, then everything else the result drew on.
            </li>
          </ul>
          <p>
            Use <strong>Copy</strong> to put the result on the clipboard as Markdown, or <strong>Download .md</strong> to
            save it as a file. Both include every section and the sources.
          </p>
        </section>

        <section id="the-app">
          <h2>The app</h2>
          <dl className="prose__defs prose__defs--tight">
            <div>
              <dt>
                <Link href="/app">Home</Link>
              </dt>
              <dd>The composer, three suggested jobs, and your five most recent runs.</dd>
            </div>
            <div>
              <dt>
                <Link href="/app/runs">Runs</Link>
              </dt>
              <dd>Every run, newest first, with a search box that matches the job, the title and the result.</dd>
            </div>
            <div>
              <dt>
                <Link href="/app/library">Library</Link>
              </dt>
              <dd>All context you have given Pact, filterable by files, links and repositories.</dd>
            </div>
            <div>
              <dt>
                <Link href="/app/integrations">Integrations</Link>
              </dt>
              <dd>What is available in the composer today, and what is planned.</dd>
            </div>
          </dl>
          <p>
            On small screens the sidebar becomes a top bar and a tab bar. <strong>New run</strong> always returns you to
            the composer.
          </p>
        </section>

        <section id="examples">
          <h2>Examples</h2>
          <p>These are the kind of tasks Pact is built for. Each opens in the app with the job pre-filled.</p>
          <ul className="prose__examples">
            {EXAMPLES.map((example) => (
              <li key={example.task}>
                <Link href={{ pathname: "/app", query: { task: example.task } }} className="prose__example">
                  <p className="prose__task">“{example.task}”</p>
                  <dl>
                    <div>
                      <dt className="label">Context</dt>
                      <dd>{example.context}</dd>
                    </div>
                    <div>
                      <dt className="label">Result</dt>
                      <dd>{example.result}</dd>
                    </div>
                  </dl>
                  <span className="prose__go">
                    Open in the app
                    <ArrowRight />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p>
            <Link href="/use-cases" className="textlink">
              More example jobs
              <ArrowRight />
            </Link>
          </p>
        </section>

        <section id="onchain">
          <p className="label docs__part">Pact Onchain</p>
          <h2>Overview</h2>
          <p>
            Pact Onchain is the same product, pointed at public blockchain data. It lives at{" "}
            <a href={ONCHAIN_URL}>onchain.runpact.family</a> and works the way everything else in Pact works: give it a
            job, get finished work back, with every figure traced to its source.
          </p>
          <p>
            It covers four chains: <strong>Robinhood Chain</strong>, <strong>Base</strong>, <strong>BNB Chain</strong> and{" "}
            <strong>Solana</strong>. You can ask about a token, a wallet, a transaction, or a chain as a whole.
          </p>
          <div className="note">
            <p className="label">Read only</p>
            <p>
              Pact Onchain never holds keys, never asks you to connect a wallet, and never sends a transaction. Nothing
              it returns is investment advice: it reports what the chain and the public data show, and leaves the
              decision to you.
            </p>
          </div>
          <p>
            <a href={ONCHAIN_URL} className="btn btn--sm">
              Open Pact Onchain
              <ArrowRight />
            </a>
          </p>
        </section>

        <section id="onchain-start">
          <h2>Getting started</h2>
          <ol className="prose__list">
            <li>
              Open <a href={ONCHAIN_URL}>Pact Onchain</a>. It starts on one question: what do you want to know?
            </li>
            <li>Pick a chain. The four cards above the composer show each chain and how much of it is covered.</li>
            <li>
              Write the job. Name the token by symbol (<code>$BRETT</code>) or paste its contract address; paste a wallet
              address or a transaction hash as it is.
            </li>
            <li>Press Run. Pact plans the checks, reads the chain and the market data, and opens the result when it is done.</li>
            <li>Find past jobs under Runs. Each row carries the mark of the chain it ran on.</li>
          </ol>
          <p>
            Onchain runs are kept apart from your other Pact runs: each surface lists only its own, and the chain tools
            are only available here.
          </p>
        </section>

        <section id="onchain-chains">
          <h2>Chains and coverage</h2>
          <p>
            Coverage is what Pact can read for a chain today. The composer shows the same status next to each chain, and
            a result says so whenever something it needed was not available.
          </p>
          <ul className="docs__chains">
            {CHAINS.map((chain) => (
              <li key={chain.id}>
                <span className="docs__chainmark">
                  <ChainIcon chain={chain.id} size={30} />
                </span>
                <div>
                  <p className="docs__chainname">
                    <strong>{chain.name}</strong>
                    <span className={chain.coverage === "Full" ? "docs__coverage is-full" : "docs__coverage is-partial"}>
                      {chain.coverage} coverage
                    </span>
                  </p>
                  <p>{chain.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <p>
            If the job names a chain, that chain wins over the one picked in the composer. If it names none, the picked
            chain is used.
          </p>
        </section>

        <section id="onchain-jobs">
          <h2>What you can ask</h2>
          <p>
            One job can combine several of these. Ask for due diligence on a token and Pact runs the identity, security
            and volume checks together; ask what moved over a month and it adds the price history. Each example opens in
            Pact Onchain with the job pre-filled.
          </p>
          <ul className="docs__jobs">
            {ONCHAIN_JOBS.map((job) => (
              <li key={job.title}>
                <h3>{job.title}</h3>
                <p>{job.body}</p>
                <a href={onchainJob(job.chain, job.task)} className="docs__try">
                  <span className="docs__trymark">
                    <ChainIcon chain={job.chain} size={18} />
                  </span>
                  <span className="docs__trytask">“{job.task}”</span>
                  <ArrowRight />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section id="onchain-writing">
          <h2>Writing an onchain job</h2>
          <p>The same rules as any Pact job, with a few that are specific to chains.</p>
          <ul className="prose__bullets">
            <li>
              <strong>Name the token precisely.</strong> A symbol works (<code>$JUP</code>), but symbols are not unique.
              When several tokens share one, Pact takes the one with the most real trading volume. Paste the contract
              address when it matters.
            </li>
            <li>
              <strong>Say the period.</strong> “Over the last 30 days”, “this week”, “today”. A period is what brings in
              price history, and it decides between daily, hourly and minute candles.
            </li>
            <li>
              <strong>Give the thresholds.</strong> “Trades above $10k”, “at least $20k liquidity”, “under 3 days old”,
              “top-ten share under 40%”. Without them Pact uses its defaults and states them in the result.
            </li>
            <li>
              <strong>Compare in one job.</strong> Name up to six tokens and ask for a comparison; you get one table
              instead of six separate answers.
            </li>
            <li>
              <strong>Say what the wallet question is.</strong> “What does it hold” and “is it safe to interact with”
              are different checks. Ask for both if you want both.
            </li>
          </ul>
          <div className="prose__compare">
            <div>
              <p className="label">Too thin</p>
              <p className="prose__task">“BRETT good?”</p>
            </div>
            <div>
              <p className="label">Better</p>
              <p className="prose__task">
                “Is $BRETT on Base safe to trade? Check the contract, liquidity locks and holder concentration, and show
                what the price did over the last 30 days.”
              </p>
            </div>
          </div>
        </section>

        <section id="onchain-results">
          <h2>Reading the result</h2>
          <p>
            An onchain result has the same fixed shape as any Pact result: summary, highlights, findings, risks and
            sources. A few things are worth knowing when you read one.
          </p>
          <dl className="prose__defs">
            <div>
              <dt>Security screens</dt>
              <dd>
                A screen is a set of automated checks, not an audit. A clean one is reported as “no flags found by the
                checks run”, never as “safe”. Flags are listed with what they mean.
              </dd>
            </div>
            <div>
              <dt>Sources</dt>
              <dd>
                Figures carry a reference to the source they came from, so you can see which reading a number rests on
                and check it yourself.
              </dd>
            </div>
            <div>
              <dt>Single-source figures</dt>
              <dd>
                When a figure comes from only one source, the result says so. That is the normal case on Robinhood
                Chain.
              </dd>
            </div>
            <div>
              <dt>Missing data</dt>
              <dd>
                If something could not be read, the result names it instead of estimating. A gap is listed as a
                limitation, not filled in.
              </dd>
            </div>
            <div>
              <dt>Snapshots</dt>
              <dd>
                Prices, volume and holders are as of the moment the run read them. Fast markets move; run the job again
                for a fresh reading.
              </dd>
            </div>
          </dl>
        </section>

        <section id="onchain-limits">
          <h2>Limits</h2>
          <ul className="prose__bullets">
            <li>
              <strong>Read only.</strong> No wallet connection, no signing, no trading, no transfers.
            </li>
            <li>
              <strong>No advice.</strong> No buy or sell calls and no price predictions. Pact describes liquidity,
              volume, holders, authorities and activity.
            </li>
            <li>
              <strong>Four chains.</strong> Robinhood Chain, Base, BNB Chain and Solana. Other chains are not read.
            </li>
            <li>
              <strong>Public data only.</strong> Pact sees what the chain and public market data show. It does not see
              private order flow, off-chain agreements or who is behind an address unless that is public.
            </li>
            <li>
              <strong>Recent windows.</strong> Large trades and volume tracking cover the last 24 hours. Price history
              goes back up to a year in daily candles.
            </li>
            <li>
              <strong>Size of a result.</strong> Comparisons take up to six tokens, screens return up to 25 rows, and
              wallet activity lists up to 25 recent transactions.
            </li>
          </ul>
        </section>

        <section id="preview-status">
          <p className="label docs__part">Reference</p>
          <h2>Preview status</h2>
          <p>Being clear about this matters more than looking finished. It covers both Pact and Pact Onchain.</p>
          <div className="prose__status">
            <div>
              <p className="label">Works today</p>
              <ul className="prose__bullets">
                {WORKS.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="label">Not yet</p>
              <ul className="prose__bullets prose__bullets--muted">
                {NOT_YET.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
          <p>
            When providers, accounts or a hosted database change what Pact does with your data, this page, the{" "}
            <Link href="/privacy">privacy notice</Link> and the <Link href="/terms">terms</Link> are updated first.
          </p>
        </section>

        <section id="faq">
          <h2>FAQ</h2>
          <dl className="prose__faq">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </article>
    </div>
  );
}
