import type { RunRecord } from "../runs/types";
import { keywords } from "../utils/text";
import type { Attachment } from "@/lib/pact/types";

// Everything the planner and synthesizer know about the job, derived once.

export type Deliverable = "comparison" | "analysis" | "summary" | "plan" | "explanation" | "research" | "writing";

export interface JobBrief {
  goal: string;
  deliverable: Deliverable;
  criteria: string[];
  /** Where the brief came from. */
  source: "model" | "rules";
}

export interface JobContext {
  job: string;
  attachments: Attachment[];
  files: Attachment[];
  links: Attachment[];
  repos: Attachment[];
  terms: string[];
  /** The job needs facts that are not in the attachments. */
  wantsResearch: boolean;
  /** "Things like this" questions, where semantic search beats keywords. */
  semantic: boolean;
  /** The job asks to explore a whole site rather than one page. */
  wantsCrawl: boolean;
  expressions: string[];
  brief: JobBrief;
  /** Which product surface the run came from. */
  surface: "app" | "onchain";
  /** Default chain chosen in the onchain composer, if any. */
  chain?: string;
}

// Cues that the job needs facts beyond what was attached. Deliberately narrow:
// "analyze this dataset and identify trends" must not trigger a web search.
const RESEARCH_WORDS = /\b(research|find out|look up|latest|current|recent|today|news|market|competitor|competitors|industry|landscape|benchmark|who is|compare .* (companies|products|vendors|tools)|using current information|up[- ]to[- ]date)\b/i;
const SEMANTIC_WORDS = /\b(similar to|like this|things like|examples of|papers (on|about)|articles (on|about)|alternatives to|comparable)\b/i;
const CRAWL_WORDS = /\b(crawl|entire (site|website)|whole (site|website)|all (the )?pages|every page|explore the (site|website)|across the (site|website)|site map|sitemap)\b/i;

const DELIVERABLE_RULES: [RegExp, Deliverable][] = [
  [/\b(write|rewrite|reword|rephrase|paraphrase|proofread|translate|draft|compose|classify|format|shorten|simplify|announcement|email|post|memo|press release|blog|tweet|caption|slogan|tagline|headline)\b/i, "writing"],
  [/\b(compare|comparison|versus|vs\.?|which (one|should)|choose|pick)\b/i, "comparison"],
  [/\b(plan|roadmap|milestones|schedule|steps to|how (do|should) we)\b/i, "plan"],
  [/\b(explain|understand|how does|how do|walk me through|what does .* do|architecture)\b/i, "explanation"],
  [/\b(analy[sz]e|analysis|what changed|why|trend|figures|numbers|breakdown|dataset)\b/i, "analysis"],
  [/\b(summar[iy]|summary|summarise|summarize|key insights|overview|tl;?dr|key points)\b/i, "summary"],
];

/** Arithmetic a person typed into the job, e.g. "12% of 340" or "1200 * 1.06 - 340". */
export function findExpressions(job: string): string[] {
  const out: string[] = [];
  for (const m of job.matchAll(/(\d[\d,]*\.?\d*)\s*%\s*of\s*(\d[\d,]*\.?\d*)/gi)) out.push(`${m[1]} % * ${m[2]}`);
  for (const m of job.matchAll(/\(?\s*-?\d[\d,]*\.?\d*(?:\s*[-+*/^]\s*\(?\s*-?\d[\d,]*\.?\d*\s*\)?)+/g)) {
    const expr = m[0].trim();
    if (/[-+*/^]/.test(expr) && !/^\d{4}\s*-\s*\d{4}$/.test(expr)) out.push(expr);
  }
  return [...new Set(out)].slice(0, 5);
}

export function briefFromRules(job: string): JobBrief {
  let deliverable: Deliverable = "research";
  for (const [re, d] of DELIVERABLE_RULES) {
    if (re.test(job)) {
      deliverable = d;
      break;
    }
  }
  const criteria = (job.match(/\b(on|by|in terms of|based on)\s+([a-z ,]+?)(?:[.,;]|$| and tell)/i)?.[2] ?? "")
    .split(/,|\band\b/)
    .map((c) => c.trim())
    .filter((c) => c.length > 2 && c.length < 40);
  return { goal: job, deliverable, criteria, source: "rules" };
}

export function buildContext(run: RunRecord, brief?: JobBrief): JobContext {
  const attachments = run.attachments;
  const files = attachments.filter((a) => a.kind === "file");
  const links = attachments.filter((a) => a.kind === "link");
  const repos = attachments.filter((a) => a.kind === "github");
  const resolvedBrief = brief ?? briefFromRules(run.job);
  // Writing and pure explanation from the model's own knowledge need no tools unless the job says otherwise.
  const explicit = RESEARCH_WORDS.test(run.job);
  const wantsResearch = explicit || (attachments.length === 0 && resolvedBrief.deliverable === "research");
  return {
    job: run.job,
    attachments,
    files,
    links,
    repos,
    terms: keywords(run.job).slice(0, 12),
    wantsResearch,
    semantic: SEMANTIC_WORDS.test(run.job),
    wantsCrawl: CRAWL_WORDS.test(run.job),
    expressions: findExpressions(run.job),
    brief: resolvedBrief,
    surface: run.surface ?? "app",
    chain: run.chain,
  };
}

/** Turns a job into a short search query: drops the instruction verbs, keeps the subject. */
export function searchQueryFor(job: string): string {
  const stripped = job
    .replace(/^(please\s+)?(research|find( out)?|look up|tell me( about)?|analy[sz]e|compare|explain|summari[sz]e|investigate|identify|what (is|are)|who (is|are))\s+/i, "")
    .replace(/\b(and (tell|explain|show) me .*|and (give|return|summari[sz]e) .*|for me|with sources?)\b.*$/i, "")
    .replace(/\b(the latest|latest|current|recent) (information|news|updates?) (about|on)\b/i, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = stripped.split(" ").slice(0, 12).join(" ");
  return (words || job).slice(0, 200);
}
