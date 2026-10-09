# Pact architecture

Pact takes a job, understands the context, works through it, and returns a
result. This document describes how the code is organised to do that and the
rules that keep it extensible.

## The shape

```
Pact Agent (src/server/agent)
│
├── LLM Provider Router            providers/llm/router.ts
│   ├── OpenRouter   PRIMARY       providers/llm/openrouter.ts
│   ├── Gemini       FALLBACK      providers/llm/gemini.ts
│   └── Groq         FALLBACK      providers/llm/groq.ts
│
├── Tool Registry                  tools/registry.ts
│   ├── web_search  → SearchRouter → Tavily, Exa
│   ├── web_read    → ReaderRouter → Jina, Firecrawl (scrape)
│   ├── web_crawl   → Firecrawl (map + scrape, bounded)
│   ├── github      → GitHub REST API (read-only)
│   ├── file_read   → local parsers: PDF, DOCX, CSV, XLSX, TXT, JSON, MD
│   ├── data_analyze → deterministic statistics in code
│   └── calculator  → arithmetic parser (no eval)
│
├── Context Manager                agent/contextManager.ts
├── Run Manager                    runs/manager.ts
├── Storage                        storage/{supabase,file,memory}.ts
└── Blob store                     blobs/local.ts (R2/S3 later)
```

Request path:

```
User → /app → POST /api/runs → RunManager.createRun → engine.runAgent
  → plan (rules, refined by the LLM router) → tool calls via the registry
  → evidence → context manager → synthesis (LLM router) → RunResult
  → storage → SSE /api/runs/:id/events → /app
```

## Two rules

**Agent ≠ Provider.** The engine, planner and synthesizer never import a
vendor. They see `LLMProvider`, `SearchProvider`, `ReaderProvider`,
`CrawlProvider` and `GitHubProvider` (`providers/types.ts`), and only
through the `Providers` bundle or a tool.

**Tool ≠ Provider.** A tool is a named capability with an input schema, an
output schema, an availability check and `execute()`. `web_search` asks the
`SearchProvider`; which vendor answers is decided by the router built in
`providers/index.ts`.

```
Agent → web_search tool → SearchRouter → Tavily (→ Exa on failure)
```

Adding a vendor means one class implementing an interface and one line in
the factory. Nothing else changes.

## Model routing

The task router (`agent/taskRouter.ts`) classifies every job before anything
runs, without spending a model call: job length, attachments (files, tables,
repositories, links), research or crawl cues, comparison, requested depth
and output length, multi-step phrasing, and how many tools the rules planner
chose. Tiers and the AUTO chain:

| Tier | Typical job | Chain |
| --- | --- | --- |
| light | rewrite, short explanation, tweet | Groq → Gemini → OpenRouter (cheap) |
| medium | summarize one document | Gemini → Groq → OpenRouter (Claude Sonnet) |
| heavy | research, code understanding, data analysis, comparisons | OpenRouter (Claude Sonnet) → Gemini → Groq |
| complex | deep multi-source reports | OpenRouter (Claude Opus if configured/available, else Sonnet) → Gemini → Groq |

Model ids come from each vendor's live list (`providers/llm/catalog.ts`,
cached an hour, served to the UI as `GET /api/models`); env overrides win.
A manual choice in the composer is honoured exactly, with no cross-vendor
fallback, so the user gets the model they picked or a clear error. The
selection, the resolved routing (mode, tier, vendor, model, chain) and the
model that actually produced the result are stored on the run. Keys never
are.

## Provider routing

Each interface is a router over the vendors that have credentials, in
priority order. A *recoverable* failure (outage, 5xx, rate limit, timeout,
unreadable reply, rejected credentials) moves to the next vendor; an invalid
request is thrown as is and never retried elsewhere. The vendor and model
that actually answered are recorded on the run (`run.llm`) and on the plan
and synthesis steps, together with how many fallbacks happened. Keys are
never recorded.

| Interface | Order | Notes |
| --- | --- | --- |
| LLM | OpenRouter → Gemini → Groq | Models from `OPENROUTER_MODEL`, `GEMINI_MODEL`, `GROQ_MODEL` |
| Search | Tavily → Exa | `mode: semantic` puts Exa first |
| Reader | Jina → Firecrawl scrape | Firecrawl is not used for ordinary pages |
| Crawl | Firecrawl | `web_crawl` only, bounded by `MAX_CRAWL_PAGES` |
| GitHub | GitHub REST | `GITHUB_API_URL` for Enterprise |

If every vendor behind the LLM router fails, the run fails with
`AGENT_PROVIDER_UNAVAILABLE`.

## Agent loop

1. **Plan** (stage `understanding`). Rules build a minimal plan from the
   job and its attachments: `file_read` (+ `data_analyze` for tables) per
   file, `github` per repository with the job as the query, `web_read` or
   `web_crawl` per link, `calculator` for arithmetic in the job, and
   `web_search` only when the job asks for facts it does not have. A job
   that needs no tools (“write a short announcement”) gets an empty plan.
   With a model available, it refines the brief and the plan; every step
   it proposes is validated against the registry and merged so attachments
   are never skipped and nothing runs twice.
2. **Execute** each step with a per-call timeout, recording a step and a
   tool call. Unavailable tools are *skipped* with a reason; failures are
   recorded and the run continues. Web and repository evidence becomes
   source records on the run.
3. **Evaluate**: one bounded follow-up. After a search with nothing read
   yet, read the top results.
4. **Synthesize** (stage `working`). The context manager dedupes the
   evidence, ranks user material above web material, keeps the paragraphs
   most relevant to the job within `MAX_SOURCE_LENGTH` per item and
   `MAX_CONTEXT_LENGTH` in total, and labels each item `[n]`. The model
   writes the result as JSON, which is coerced into the result shape and
   rejected if the essentials are missing. Model-cited sources are kept only
   when they match something that was actually gathered. If no configured
   model responds, the run **fails** with `AGENT_PROVIDER_UNAVAILABLE`;
   there is no substitute result anywhere in the application.

Limits: `MAX_AGENT_STEPS`, `MAX_TOOL_CALLS`, `MAX_SEARCH_RESULTS`,
`MAX_SOURCE_LENGTH`, `MAX_CONTEXT_LENGTH`, `MAX_CRAWL_PAGES`,
`TOOL_TIMEOUT_MS`, `LLM_TIMEOUT_MS`, `PARSER_TIMEOUT_MS`, `RUN_TIMEOUT_MS`,
`MAX_UPLOAD_BYTES`. Only high-level progress leaves the server.

## Files

`files/validate.ts` sanitises the name and checks size, extension and magic
bytes. `files/extract.ts` parses locally under `PARSER_TIMEOUT_MS`:

| Type | Output |
| --- | --- |
| PDF | `pages[{pageNumber, text}]`, page-separated text; image-only PDFs report `textUnavailable` (no OCR is claimed); password-protected files are rejected |
| DOCX | headings (`#`), paragraphs, lists, tables (`a \| b`) |
| CSV | `TableData`: columns, rowCount, sample rows, up to 5,000 stored rows, per-column type and statistics |
| XLSX | one `TableData` per sheet, sheet names preserved |
| JSON | arrays of flat objects become tables; otherwise text |
| TXT, MD | text, headings |

`files/analysis.ts` computes totals, averages, medians, group breakdowns,
top rows and first-to-last change in code. `data_analyze` hands those
findings to the model as exact figures; the model explains, it does not
compute.

## Run lifecycle

```
queued ──► running ──► completed
   │          ├──────► failed
   └──────────┴──────► cancelled
```

A run holds steps (`plan`, `tool`, `evaluate`, `synthesize`), tool calls,
an activity log, sources, the model that handled it, and a result or a
clean error.

## Persistence

`StorageAdapter` is the only thing that touches storage. `PACT_STORAGE`
selects `supabase`, `file`, `memory` (tests only), or `auto` (Supabase
whenever credentials are set, otherwise files). A configured database that
cannot be reached is an error on every request, never a silent switch. `SupabaseStorage` talks
to PostgREST with the server-side secret and stores records in the tables
from `supabase/migrations/0001_init.sql`; raw bytes go through `BlobStore`
(`blobs/local.ts` now, R2 later). The publishable key is never used by the
server and the secret never reaches the browser.

## Security posture

- All request bodies validated; tool inputs validated against schemas;
  unknown fields dropped.
- Filenames sanitised; uploads size-limited and type-checked by extension
  and magic bytes; parsers run under a timeout; files are never executed.
- No shell, no `eval`; the calculator is a parser.
- URLs handed to tools must be public http(s); private ranges are refused.
- External content is sanitised and presented to the model as untrusted
  data; model-invented sources are discarded.
- Keys live in `config.ts` and provider adapters only; logs carry ids,
  names, counts, durations and status codes.
