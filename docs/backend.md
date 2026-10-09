# Pact backend

How to run it, configure it, call it, and extend it.

## Run locally

```
npm install
copy .env.example .env.local      # add keys
npm run dev                       # http://localhost:3000
```

Every run uses real providers. A run with no responding language model
fails with a clear error; web tools without a key are skipped and reported
as unavailable. There is no simulated execution outside the test suite.

Checks:

```
npm run typecheck
npm run lint
npm test
npm run build
npm run check        # all four
```

## Environment variables

| Variable | Default | Effect |
| --- | --- | --- |
| `PACT_MODE` | `development` | Logging only; both modes use real providers. |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | — / live catalog (current Claude Sonnet) | Heavy-tier model. |
| `OPENROUTER_MODEL_COMPLEX` / `OPENROUTER_MODEL_LIGHT` | live catalog (Opus / Haiku) | Complex-tier and light-tier OpenRouter models. |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | — / live catalog (newest stable Flash) | Medium tier first; fallback elsewhere. |
| `GROQ_API_KEY` / `GROQ_MODEL` | — / live catalog (gpt-oss-120b) | Light tier first; fallback elsewhere. |
| `TAVILY_API_KEY` | — | Primary web search. |
| `EXA_API_KEY` | — | Search fallback; first for semantic queries. |
| `JINA_API_KEY` | — | Primary page reader. |
| `FIRECRAWL_API_KEY` | — | Reader fallback and `web_crawl`. |
| `GITHUB_TOKEN` / `GITHUB_API_URL` | — / `https://api.github.com` | Read-only repository access. |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | — | Database (server-side only). `SUPABASE_SERVICE_ROLE_KEY` is accepted as the secret too. |
| `PACT_STORAGE` | `auto` | `supabase`, `file`, `memory`, or `auto`. |
| `PACT_DATA_DIR` | `.pact-data` | Local JSON records (file storage) and raw file bytes. |
| `MAX_AGENT_STEPS` | `12` | Hard cap on steps per run. |
| `MAX_TOOL_CALLS` | `10` | Hard cap on tool calls per run. |
| `MAX_SEARCH_RESULTS` | `5` | Per search. |
| `MAX_SOURCE_LENGTH` | `12000` | Characters kept per source in the model context. |
| `MAX_CONTEXT_LENGTH` | `60000` | Characters of evidence sent to the model. |
| `MAX_CRAWL_PAGES` | `5` | Pages per `web_crawl`. |
| `TOOL_TIMEOUT_MS` / `LLM_TIMEOUT_MS` / `PARSER_TIMEOUT_MS` / `RUN_TIMEOUT_MS` | `25000` / `60000` / `30000` / `240000` | Timeouts. |
| `MAX_UPLOAD_BYTES` | `10485760` | Upload limit (10 MB). |
| `NEXT_PUBLIC_PACT_CLIENT` | — | `mock` makes the app use the browser-only simulation. |

Secrets are read once in `src/server/config.ts` and passed to provider
constructors. They are never logged, never returned by any endpoint, never
stored on a run, and never sent to the browser.

## Database

Apply the files in `supabase/migrations/` in order in the Supabase SQL
editor (or `supabase db push`): 0001 tables, 0002 routing metadata, 0003 the
`detail` column that holds a run's steps, tool calls and sources. Tables:
`users`, `runs`, `run_steps`, `tool_calls`, `sources`, `files`,
`artifacts`. Row Level Security is enabled on all of them; the server uses
the secret key, so the publishable key cannot read run data. With Supabase
configured there is no fallback: a missing migration surfaces as a clear
"schema is out of date" error on the request that needed it.

## Identity (development)

There are no accounts. The browser generates a stable id and sends it as
`x-pact-user` (or `?user=` for the event stream). Runs and files are scoped
to it. `src/server/auth.ts` is the single place to replace with a session
lookup.

## API

All responses are JSON unless noted. Errors have one shape:

```json
{ "error": { "code": "PROVIDER_UNAVAILABLE", "message": "Web research is temporarily unavailable." } }
```

Codes: `INVALID_REQUEST` 400, `NOT_FOUND` 404, `UNSUPPORTED_FILE` 415,
`FILE_TOO_LARGE` 413, `PROVIDER_UNAVAILABLE` 503,
`AGENT_PROVIDER_UNAVAILABLE` 503, `PROVIDER_TIMEOUT` 504, `RATE_LIMITED`
429, `MALFORMED_PROVIDER_RESPONSE` 502, `AGENT_FAILURE`,
`STEP_LIMIT_REACHED`, `STORAGE_FAILURE`, `INTERNAL_ERROR` 500,
`RUN_CANCELLED` 409. Stack traces never leave the server.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/runs` | Create a run. Body `{ task, attachments[] }`. Returns `201 { run }` with status `queued`; the agent starts immediately. |
| `GET` | `/api/runs?limit=50` | The caller's runs, newest first. |
| `GET` | `/api/runs/:id` | One run: status, stage, activity, sources, `llm` (vendor + model), result or error. |
| `GET` | `/api/runs/:id/steps` | Steps and tool calls (metadata only, including which provider handled plan and synthesis). |
| `POST` | `/api/runs/:id/cancel` | Cancel. Acknowledged immediately; the run reaches `cancelled` at its next step boundary. |
| `GET` | `/api/runs/:id/events?user=` | Server-Sent Events: `snapshot`, `stage`, `activity`, `step`, then `completed` / `failed` / `cancelled`. |
| `POST` | `/api/files` | Multipart upload, field `file`. Returns `{ file, attachment }`; put `attachment` on a run. |
| `GET` | `/api/files` | The caller's files. |
| `GET` | `/api/files/:id` | File metadata plus a text preview and table stats. |
| `GET` | `/api/models` | Live model lists per vendor (OpenRouter shows Claude models), with context and pricing. Cached server-side. |
| `GET` | `/api/health` | `status`, `providers` as a flat true/false map, storage in use, limits, tool listing. |

## Tools

| Tool | Stage shown | Needs | Does |
| --- | --- | --- | --- |
| `calculator` | analyzing | — | Exact arithmetic with a parser. |
| `file_read` | analyzing | an uploaded file | Text (per page for PDFs), headings, one table description per sheet. |
| `data_analyze` | analyzing | an uploaded table | Totals, averages, medians, group breakdowns, top rows, first-to-last change, computed in code. |
| `web_search` | researching | `SearchProvider` | Query → `{title, url, snippet, source, publishedAt}`; `mode: semantic` for “things like this”. |
| `web_read` | researching | `ReaderProvider` | One public URL → `{url, title, content, metadata}`. |
| `web_crawl` | researching | `CrawlProvider` | Site map + several pages, bounded. Planned only when a job asks to explore a site. |
| `github` | researching | `GitHubProvider` | Metadata, key files, files relevant to the job (ranked by path), compact tree; or `tree` / one `file`. Read-only. |

Planned names registered as unavailable: `document_search`, `vector_search`,
`email`, `drive`, `calendar`, `generate_report`.

### Add a tool

1. Create `src/server/tools/<name>.ts` exporting a `Tool`. Return `evidence`
   the synthesizer can quote, with `provider` set so sources are recorded.
2. Register it in `createDefaultRegistry()` in `registry.ts`.
3. Optionally teach `planner.ts` when rules should plan it. The model
   planner discovers it from the registry listing automatically.

### Add a provider

1. Implement the interface from `providers/types.ts` in
   `providers/<kind>/<vendor>.ts`, using `fetchJson`/`fetchText` from
   `utils/http.ts` so timeouts and error mapping are consistent.
2. Add it to the right chain in `providers/index.ts`.
3. Add the variable to `.env.example` and the table above.

## Files

Pipeline: upload → validate → detect → extract locally (timeout) →
normalise → `DocumentRepresentation` (`{id, name, kind, mime, size,
createdAt, text, table?, tables?, pages?, meta}`) → store → `file_read` /
`data_analyze`. Libraries: `pdf-parse` (pdf.js), `mammoth`, `exceljs`; CSV
and JSON are parsed in-house. Nothing is sent to an external service to
extract text.

Raw bytes live behind `BlobStore`: `LocalBlobStore` (disk under
`PACT_DATA_DIR/blobs`) or `SupabaseBlobStore` (a private `pact-files` bucket
in Supabase Storage, created on first use). Supabase Storage is used whenever
Supabase is configured unless `PACT_BLOBS=local`; on Cloudflare Workers, which
has no disk, it is always used.

## Logging

One JSON line per event: `run.created`, `run.started`, `tool.called`,
`tool.completed`, `tool.failed`, `llm.failover`, `search.failover`,
`reader.failover`, `run.completed`, `run.failed`, `run.cancelled`,
`file.ingested`, `storage.selected`, `api.error`. Fields are ids, tool and
vendor names, status, durations and error codes. `PACT_LOG=silent` disables
output.

## Tests

`npm test` runs `tests/*.test.ts` with `node:test` via `tsx`, in-memory
storage, fake providers and a stubbed `fetch`. Covered: provider adapters
(OpenRouter, Gemini, Groq, Tavily, Exa, Jina, Firecrawl, GitHub) and their
error mapping; LLM, search and reader routing with fallbacks; the provider
factory; parsers (PDF per page and image-only, DOCX structure, XLSX
multi-sheet, CSV, JSON) and deterministic analysis; the context manager;
tool selection; the registry; run lifecycle, limits, cancellation and
production-mode failure; file storage under concurrency; the Supabase
adapter against a PostgREST stand-in; API error mapping; and an end-to-end
job through the route handlers. No test needs a live credential.

## Deploy to Cloudflare Workers

The app runs on Workers through `@opennextjs/cloudflare`. Config lives in
`wrangler.jsonc` and `open-next.config.ts`; the entry is
`src/cloudflare/worker.ts`, which wraps the OpenNext handler and exports the
`RunExecutor` Durable Object.

Why a Durable Object: a Worker request may only outlive its response by 30
seconds (`waitUntil`), far less than a run. `RunManager.createRun` therefore
hands the run to its Durable Object (`dispatchRun` in `src/server/runtime.ts`),
whose alarm handler executes it with Durable Object limits (15 minutes wall
clock, 30 seconds CPU). Progress is written to Supabase as usual, so the
events route follows a run it is not executing by polling storage, and
cancel reaches the executor through the same object. On Node nothing
changes: the run executes in-process.

A run whose executor disappeared (restart, evicted isolate) is closed out as
`failed` with code `RUN_INTERRUPTED` the next time it is read, once it has
made no progress for `RUN_TIMEOUT_MS` plus a minute.

Steps:

```
npx wrangler login              # once
npm run cf:build                # Next build + OpenNext bundle (patches OpenNext for Windows and Next 16.4)
npm run cf:preview              # optional: run the bundle locally (reads .dev.vars)
npm run cf:deploy               # creates/updates the Worker on workers.dev
npm run cf:secrets              # uploads the provider keys from .env.local as Worker secrets
```

Non-secret settings (`PACT_STORAGE=supabase`, `PACT_BLOBS=supabase`, timeouts)
are `vars` in `wrangler.jsonc`. Secrets are never written to that file.
Limits to know on the free plan: 10 ms CPU per Worker request (the Durable
Object gets 30 s, which is why extraction-heavy work is fine inside runs),
3 MB compressed bundle (currently about 2.3 MB), no filesystem (hence
Supabase Storage for file bytes), and 50 outbound requests per invocation.
That last one is why a run's progress is written as one row (migration 0003,
`detail` jsonb) and why writes closer together than 2.5 s are merged
(`WriteCoalescer`): a run spends its budget on model and tool calls, not on
bookkeeping. A run that still exhausts it is closed out as `RUN_INTERRUPTED`
by a second alarm with a fresh budget.
