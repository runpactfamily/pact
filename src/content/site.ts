export const SITE = {
  name: "Pact",
  tagline: "Give it a job.",
  description: "Pact understands your context, works through the task, and gives you the result.",
  domain: "runpact.family",
  url: "https://runpact.family",
  xHandle: "@runpactfamily",
  xUrl: "https://x.com/runpactfamily",
  githubUrl: "https://github.com/runpactfamily/pact",
};

/** Pact Onchain lives on its own host. */
export const ONCHAIN_URL = "https://onchain.runpact.family";
/** So do the docs. On the main site /docs is sent there; elsewhere (local, workers.dev) /docs is the page itself. */
export const DOCS_URL = "https://docs.runpact.family";

export const NAV_LINKS: { href: string; label: string; external?: boolean }[] = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/use-cases", label: "Example jobs" },
  { href: ONCHAIN_URL, label: "Onchain", external: true },
  { href: "/docs", label: "Docs" },
];

// Every footer link points at a route that exists today.

export const FOOTER_GROUPS = [
  {
    title: "Product",
    links: [
      { href: "/", label: "Overview" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/use-cases", label: "Example jobs" },
      { href: "/#onchain", label: "Pact Onchain" },
    ],
  },
  {
    title: "Inside the app",
    links: [
      { href: "/app", label: "New run" },
      { href: "/app/runs", label: "Runs" },
      { href: "/app/library", label: "Library" },
      { href: "/app/integrations", label: "Integrations" },
    ],
  },
  {
    title: "Pact Onchain",
    links: [
      { href: ONCHAIN_URL, label: "Open Onchain", external: true },
      { href: `${ONCHAIN_URL}/?chain=robinhood`, label: "Robinhood Chain", external: true },
      { href: `${ONCHAIN_URL}/?chain=base`, label: "Base", external: true },
      { href: `${ONCHAIN_URL}/?chain=bnb`, label: "BNB Chain", external: true },
      { href: `${ONCHAIN_URL}/?chain=solana`, label: "Solana", external: true },
    ],
  },
  {
    title: "Docs",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/docs?section=getting-started", label: "Getting started" },
      { href: "/docs?section=writing-a-job", label: "Writing a job" },
      { href: "/docs?section=onchain", label: "Onchain guide" },
      { href: "/docs?section=onchain-chains", label: "Chains and coverage" },
      { href: "/docs?section=preview-status", label: "Preview status" },
    ],
  },
  {
    title: "Connect",
    links: [
      { href: "https://x.com/runpactfamily", label: "X @runpactfamily", external: true },
      { href: "https://github.com/runpactfamily/pact", label: "GitHub", external: true },
    ],
  },
];

// Homepage copy. Kept here so the page file stays about structure.
export const HOME = {
  heroStrip: ["Give it the job", "Give it the context", "Get the work back"],
  idea: {
    headline: "Work doesn’t need another interface.",
    copy: ["Most software asks you to learn how it works before it can help you.", "Pact starts with what you need done."],
    traditional: ["Find the tool", "Choose the workflow", "Import the data", "Configure", "Run", "Review", "Fix", "Repeat"],
  },
  loop: {
    headline: "From intent to outcome.",
    stages: [
      { n: "01", title: "The job", body: "A natural-language objective." },
      { n: "02", title: "The context", body: "Files, links, repositories, data, references." },
      { n: "03", title: "The work", body: "Researching, reasoning, processing, checking." },
      { n: "04", title: "The result", body: "A finished, structured output." },
    ],
  },
  previewTask: "Research the best payment infrastructure for a SaaS expanding into the UK and the US.",
  work: {
    headline: "Give Pact the work you don’t want to do manually.",
  },
  onchain: {
    label: "Pact Onchain",
    headline: "The same job, pointed at the chain.",
    copy: [
      "Ask about a token, a wallet, a transaction or a whole chain. Pact reads the public data, runs the checks, and hands back the finished work with every figure traced to its source.",
      "Read only. No wallet to connect, no keys, no transactions.",
    ],
    capabilities: [
      { title: "Token analysis", body: "Identity, price, liquidity, holders, age, all-time high, and price history up to a year." },
      { title: "Security", body: "Honeypot and tax checks, mint and freeze authority, ownership, holder concentration, liquidity locks." },
      { title: "Market intelligence", body: "What is moving on a chain, large trades and net flow, DeFi protocols, stablecoins and yields." },
      { title: "New tokens and screens", body: "Fresh launches screened for risk, and screens by liquidity, volume, age, holders and launchpad stage." },
      { title: "Volume tracking", body: "Volume across the last day, buy and sell pressure, and where the activity is concentrated." },
      { title: "Wallets and transactions", body: "Holdings and activity for any address, risky approvals, and any transaction explained in plain words." },
    ],
  },
  statement: {
    headline: "You shouldn’t have to learn another tool just to get something done.",
    lines: ["Tell Pact what needs to happen.", "Give it the context.", "Let it work."],
  },
  philosophy: ["Pact doesn’t replace your judgment.", "It removes the work between intention and outcome."],
  closing: "Have something to get done?",
};

export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export const JOB_CATEGORIES = [
  "Research",
  "Documents",
  "Data",
  "Code",
  "Market analysis",
  "Comparisons",
  "Planning",
] as const;

export type JobCategory = (typeof JOB_CATEGORIES)[number];

export interface ExampleJob {
  category: JobCategory;
  job: string;
  context: string;
  returns: string;
}

export const EXAMPLE_JOBS: ExampleJob[] = [
  {
    category: "Research",
    job: "Find out how mid-size logistics companies handle returns, and what it costs them.",
    context: "No files. Starts from the question.",
    returns: "Research brief with sources",
  },
  {
    category: "Research",
    job: "Summarize what has been published on four-day work weeks since 2023.",
    context: "2 links to start from",
    returns: "Summary of the evidence, for and against",
  },
  {
    category: "Documents",
    job: "Analyze these documents and create a summary with the key insights.",
    context: "6 PDFs",
    returns: "Summary with key insights",
  },
  {
    category: "Documents",
    job: "Read this contract and list every obligation we take on, with dates.",
    context: "1 PDF, 48 pages",
    returns: "Obligations table",
  },
  {
    category: "Data",
    job: "Go through this sales export and tell me where we are losing customers.",
    context: "1 CSV, 40,000 rows",
    returns: "Findings with supporting figures",
  },
  {
    category: "Data",
    job: "Clean up this survey data and report the five strongest patterns.",
    context: "1 spreadsheet",
    returns: "Cleaned dataset and a short report",
  },
  {
    category: "Code",
    job: "Read this repository and explain how authentication works.",
    context: "1 GitHub repository",
    returns: "Flow overview with file references",
  },
  {
    category: "Code",
    job: "Work out why checkout is slow and where the time goes.",
    context: "1 GitHub repository, 1 trace export",
    returns: "Diagnosis and a list of fixes",
  },
  {
    category: "Market analysis",
    job: "Research the market for refurbished espresso machines in Northern Europe and tell me where the opening is.",
    context: "1 sales export, 2 links",
    returns: "Market research report",
  },
  {
    category: "Market analysis",
    job: "Track what our three closest competitors shipped this quarter.",
    context: "3 links",
    returns: "Competitor briefing",
  },
  {
    category: "Comparisons",
    job: "Compare these four suppliers on price, lead time and risk.",
    context: "4 quotations",
    returns: "Comparison table and a recommendation",
  },
  {
    category: "Comparisons",
    job: "Compare three payroll providers for a 40-person company in two countries.",
    context: "3 links",
    returns: "Side-by-side comparison",
  },
  {
    category: "Planning",
    job: "Turn this objective into a twelve-week plan with owners and milestones.",
    context: "1 brief",
    returns: "Phased plan",
  },
  {
    category: "Planning",
    job: "Plan the migration from our old billing system with the least downtime.",
    context: "1 GitHub repository, 2 documents",
    returns: "Migration plan with risks",
  },
];

export const APP_SUGGESTIONS = [
  "Analyze these documents and create a summary with the key insights.",
  "Compare these four suppliers on price, lead time and risk.",
  "Read this repository and explain how authentication works.",
];
