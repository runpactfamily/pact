import type { TaskTier } from "../providers/types";
import type { JobContext } from "./context";
import type { PlanStep } from "./planner";

// Decides how much reasoning a job needs before anything runs. Deterministic:
// no model is spent on classifying the job. Signals are the job text, what
// was attached, and the tools the rules planner chose.

export interface RoutingSignals {
  jobChars: number;
  files: number;
  tabular: number;
  repos: number;
  links: number;
  tools: number;
  research: boolean;
  crawl: boolean;
  comparison: boolean;
  depth: boolean;
  longOutput: boolean;
  multiStep: boolean;
  trivial: boolean;
  /** The run comes from Pact Onchain: evidence is dense tables that need the strong model. */
  onchain: boolean;
}

const DEPTH = /\b(deep|in[- ]depth|thorough|comprehensive|detailed|exhaustive|strategic|strategy|landscape|due diligence|audit)\b/i;
const LONG_OUTPUT = /\b(report|whitepaper|full analysis|long[- ]form|essay|documentation|business plan|proposal)\b/i;
const MULTI_STEP = /\b(then|after that|step by step|and (then|also)|as well as|plus|across|multiple|several|\d{2,}\s+(companies|sources|products|vendors|files|pages))\b/i;
const COMPARISON = /\b(compare|comparison|versus|vs\.?|benchmark|rank|strongest|best .* (approach|option|vendor|tool))\b/i;
const TRIVIAL = /^(rewrite|reword|rephrase|paraphrase|proofread|fix (the )?(grammar|typos)|translate|classify|tag|label|format|shorten|expand|simplify|summari[sz]e (this|the following) (sentence|paragraph|text|tweet|message)|write (me )?(a|an)? ?(short )?(tweet|caption|slogan|tagline|subject line|headline|one-liner))\b/i;
const TABULAR = /\.(csv|xlsx|json)$/i;

export function routingSignals(context: JobContext, plan: PlanStep[]): RoutingSignals {
  const job = context.job;
  return {
    jobChars: job.length,
    files: context.files.length,
    tabular: context.files.filter((f) => TABULAR.test(f.label)).length,
    repos: context.repos.length,
    links: context.links.length,
    tools: plan.length,
    research: context.wantsResearch,
    crawl: context.wantsCrawl,
    comparison: COMPARISON.test(job),
    depth: DEPTH.test(job),
    longOutput: LONG_OUTPUT.test(job),
    multiStep: MULTI_STEP.test(job),
    trivial: TRIVIAL.test(job.trim()),
    onchain: context.surface === "onchain",
  };
}

export function classifyTask(signals: RoutingSignals): TaskTier {
  let score = 0;
  if (signals.repos) score += 3; // understanding a codebase is never light
  if (signals.research) score += 3; // research jobs go to the strong model
  if (signals.crawl) score += 2;
  if (signals.onchain) score += 2;
  if (signals.comparison) score += 1;
  if (signals.depth) score += 2;
  if (signals.longOutput) score += 1;
  if (signals.multiStep) score += 1;
  score += Math.min(3, signals.files);
  score += Math.min(2, signals.tabular);
  score += Math.min(2, signals.links);
  if (signals.tools >= 4) score += 2;
  else if (signals.tools >= 2) score += 1;
  if (signals.jobChars > 600) score += 1;
  if (signals.jobChars > 1500) score += 1;

  if (signals.trivial && signals.tools === 0 && signals.files === 0) return "light";
  if (score >= 7) return "complex";
  if (score >= 3) return "heavy";
  if (score >= 1) return "medium";
  return "light";
}

export function routeTask(context: JobContext, plan: PlanStep[]): { tier: TaskTier; signals: RoutingSignals } {
  const signals = routingSignals(context, plan);
  return { tier: classifyTask(signals), signals };
}

/** Output budget per tier, in tokens. Keeps cheap tasks cheap and gives reports room. */
export const OUTPUT_TOKENS: Record<TaskTier, number> = { light: 2048, medium: 4096, heavy: 8192, complex: 12_000 };
