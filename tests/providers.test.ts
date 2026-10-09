import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { resetConfig } from "../src/server/config";
import { createProviders } from "../src/server/providers";
import { FirecrawlProvider } from "../src/server/providers/crawl/firecrawl";
import { GitHubApiProvider } from "../src/server/providers/github/githubApi";
import { GeminiProvider } from "../src/server/providers/llm/gemini";
import { GroqProvider } from "../src/server/providers/llm/groq";
import { OpenRouterProvider } from "../src/server/providers/llm/openrouter";
import { LLMRouter } from "../src/server/providers/llm/router";
import { JinaReaderProvider } from "../src/server/providers/reader/jina";
import { ReaderRouter } from "../src/server/providers/reader/router";
import { ExaProvider } from "../src/server/providers/search/exa";
import { SearchRouter } from "../src/server/providers/search/router";
import { TavilyProvider } from "../src/server/providers/search/tavily";
import { stubFetch } from "./helpers";

const chat = (content: string) => ({ json: { choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } });
const msgs = [{ role: "user" as const, content: "hi" }];

test("openrouter: normalises chat completions and never leaks the key", async () => {
  const stub = stubFetch({ "openrouter.ai/api/v1/chat/completions": () => chat('{"ok":true}') });
  try {
    const p = new OpenRouterProvider("sk-or-test", "some/model");
    const r = await p.generate({ messages: msgs, json: true });
    assert.equal(r.vendor, "openrouter");
    assert.equal(r.model, "some/model");
    assert.equal(r.text, '{"ok":true}');
    assert.equal(r.usage?.inputTokens, 10);
    assert.equal(stub.calls[0].headers.authorization, "Bearer sk-or-test");
    assert.equal(stub.calls[0].body.model, "some/model");
    assert.deepEqual(stub.calls[0].body.response_format, { type: "json_object" });
    assert.ok(!JSON.stringify(r).includes("sk-or-test"));
  } finally {
    stub.restore();
  }
});

test("openrouter: retries without response_format when the model rejects it", async () => {
  let n = 0;
  const stub = stubFetch({ "chat/completions": (call) => (++n === 1 && call.body.response_format ? { status: 400, json: { error: { message: "unsupported" } } } : chat("{}")) });
  try {
    const r = await new OpenRouterProvider("k", "m").generate({ messages: msgs, json: true });
    assert.equal(r.text, "{}");
    assert.equal(stub.calls.length, 2);
    assert.equal(stub.calls[1].body.response_format, undefined);
  } finally {
    stub.restore();
  }
});

test("openai-compatible errors map to clean codes", async () => {
  for (const [status, code] of [[401, "PROVIDER_UNAVAILABLE"], [429, "RATE_LIMITED"], [503, "PROVIDER_UNAVAILABLE"]] as const) {
    const stub = stubFetch({ "groq.com": () => ({ status, json: {} }) });
    try {
      await assert.rejects(new GroqProvider("k", "m").generate({ messages: msgs }), (e: Error & { code?: string }) => e.code === code);
    } finally {
      stub.restore();
    }
  }
  const empty = stubFetch({ "groq.com": () => ({ json: { choices: [{ message: { content: "" } }] } }) });
  try {
    await assert.rejects(new GroqProvider("k", "m").generate({ messages: msgs }), (e: Error & { code?: string }) => e.code === "MALFORMED_PROVIDER_RESPONSE");
  } finally {
    empty.restore();
  }
  const junk = stubFetch({ "groq.com": () => ({ text: "<html>not json</html>" }) });
  try {
    await assert.rejects(new GroqProvider("k", "m").generate({ messages: msgs }), (e: Error & { code?: string }) => e.code === "MALFORMED_PROVIDER_RESPONSE");
  } finally {
    junk.restore();
  }
});

test("gemini: normalises generateContent", async () => {
  const stub = stubFetch({ "generativelanguage.googleapis.com": () => ({ json: { candidates: [{ content: { parts: [{ text: "hello" }] } }], usageMetadata: { promptTokenCount: 3 } } }) });
  try {
    const r = await new GeminiProvider("gk", "gemini-x").generate({ messages: [{ role: "system", content: "sys" }, ...msgs], json: true });
    assert.equal(r.vendor, "gemini");
    assert.equal(r.text, "hello");
    assert.ok(stub.calls[0].url.includes("key=gk"));
    assert.equal(stub.calls[0].body.generationConfig.responseMimeType, "application/json");
    assert.equal(stub.calls[0].body.systemInstruction.parts[0].text, "sys");
  } finally {
    stub.restore();
  }
});

test("llm router: OpenRouter first, Gemini then Groq on recoverable failures, tracked in the result", async () => {
  const stub = stubFetch({
    "openrouter.ai": () => ({ status: 503, json: {} }),
    "generativelanguage": () => ({ status: 429, json: {} }),
    "groq.com": () => chat("from groq"),
  });
  try {
    const router = new LLMRouter([new OpenRouterProvider("a", "m1"), new GeminiProvider("b", "m2"), new GroqProvider("c", "m3")]);
    assert.deepEqual(router.vendors, ["openrouter", "gemini", "groq"]);
    assert.equal(router.vendor, "openrouter");
    const r = await router.generate({ messages: msgs });
    assert.equal(r.vendor, "groq");
    assert.equal(r.text, "from groq");
    assert.deepEqual(r.failovers, [{ vendor: "openrouter", code: "PROVIDER_UNAVAILABLE" }, { vendor: "gemini", code: "RATE_LIMITED" }]);
  } finally {
    stub.restore();
  }
});

test("llm router: all providers down → AGENT_PROVIDER_UNAVAILABLE; invalid requests do not fall back", async () => {
  const down = stubFetch({ "openrouter.ai": () => ({ status: 500, json: {} }), "groq.com": () => ({ status: 500, json: {} }) });
  try {
    await assert.rejects(new LLMRouter([new OpenRouterProvider("a", "m"), new GroqProvider("c", "m")]).generate({ messages: msgs }), (e: Error & { code?: string }) => e.code === "AGENT_PROVIDER_UNAVAILABLE");
    assert.equal(down.calls.length, 2);
  } finally {
    down.restore();
  }
  let calls = 0;
  const router = new LLMRouter([
    { vendor: "one", model: "m", generate: async () => { calls++; throw new (await import("../src/server/errors")).PactError("INVALID_REQUEST", "bad input"); } },
    { vendor: "two", model: "m", generate: async () => { calls++; return { text: "x", vendor: "two", model: "m", durationMs: 1 }; } },
  ]);
  await assert.rejects(router.generate({ messages: msgs }), /bad input/);
  assert.equal(calls, 1);
});

test("tavily and exa normalise results; search router falls back and honours semantic mode", async () => {
  const stub = stubFetch({
    "api.tavily.com": () => ({ json: { results: [{ title: "T", url: "https://t.example/a", content: "tav snippet", published_date: "2026-01-02" }, { url: "ftp://bad" }] } }),
    "api.exa.ai": () => ({ json: { results: [{ title: "E", url: "https://e.example/b", text: "exa text", publishedDate: "2026-03-04" }] } }),
  });
  try {
    const t = await new TavilyProvider("tk").search("q");
    assert.deepEqual(t, [{ title: "T", url: "https://t.example/a", snippet: "tav snippet", source: "tavily", publishedAt: "2026-01-02", score: undefined }]);
    assert.equal(stub.calls[0].headers.authorization, "Bearer tk");
    const e = await new ExaProvider("ek").search("q", { mode: "semantic" });
    assert.equal(e[0].source, "exa");
    assert.equal(stub.calls[1].headers["x-api-key"], "ek");
    assert.equal(stub.calls[1].body.type, "neural");

    const router = new SearchRouter([new TavilyProvider("tk"), new ExaProvider("ek")]);
    assert.equal((await router.search("q"))[0].source, "tavily");
    assert.equal((await router.search("q", { mode: "semantic" }))[0].source, "exa");
  } finally {
    stub.restore();
  }
  const broken = stubFetch({ "api.tavily.com": () => ({ status: 500, json: {} }), "api.exa.ai": () => ({ json: { results: [{ title: "E", url: "https://e.example/b", text: "x" }] } }) });
  try {
    const r = await new SearchRouter([new TavilyProvider("tk"), new ExaProvider("ek")]).search("q");
    assert.equal(r[0].source, "exa", "falls back to Exa when Tavily is down");
  } finally {
    broken.restore();
  }
});

test("jina reader normalises content and metadata; reader router falls back to firecrawl", async () => {
  const jinaText = "Title: A Page\nURL Source: https://x.example/p\nPublished Time: 2026-05-06\nMarkdown Content:\nThis is the readable body of the page, long enough to count as content.";
  const stub = stubFetch({
    "r.jina.ai": () => ({ text: jinaText }),
    "api.firecrawl.dev/v1/scrape": () => ({ json: { success: true, data: { markdown: "Firecrawl got the page body, which is also long enough to count.", metadata: { title: "FC", sourceURL: "https://x.example/p" } } } }),
  });
  try {
    const j = await new JinaReaderProvider("jk").read("https://x.example/p");
    assert.equal(j.title, "A Page");
    assert.equal(j.metadata.publishedAt, "2026-05-06");
    assert.equal(j.metadata.provider, "jina");
    assert.match(j.content, /readable body/);
    assert.ok(!j.content.includes("Markdown Content"));
    await assert.rejects(new JinaReaderProvider("jk").read("http://localhost/x"), /private or local/);
  } finally {
    stub.restore();
  }
  const jinaDown = stubFetch({ "r.jina.ai": () => ({ status: 502, text: "" }), "api.firecrawl.dev/v1/scrape": () => ({ json: { success: true, data: { markdown: "Firecrawl got the page body, which is also long enough to count.", metadata: { title: "FC" } } } }) });
  try {
    const r = await new ReaderRouter([new JinaReaderProvider("jk"), new FirecrawlProvider("fk")]).read("https://x.example/p");
    assert.equal(r.metadata.provider, "firecrawl");
    assert.equal(r.title, "FC");
  } finally {
    jinaDown.restore();
  }
});

test("firecrawl crawl: maps the site, reads same-host pages up to the limit", async () => {
  const stub = stubFetch({
    "/v1/map": () => ({ json: { success: true, links: ["https://site.example/a", "https://other.example/x", "https://site.example/b", "https://site.example/c"] } }),
    "/v1/scrape": (call) => ({ json: { success: true, data: { markdown: `Body of ${call.body.url} with enough words to pass the minimum length check.`, metadata: { title: call.body.url } } } }),
  });
  try {
    const pages = await new FirecrawlProvider("fk").crawl("https://site.example", { maxPages: 3 });
    assert.deepEqual(pages.map((p) => p.url), ["https://site.example/", "https://site.example/a", "https://site.example/b"]);
    assert.equal(stub.calls.filter((c) => c.url.includes("/scrape")).length, 3);
  } finally {
    stub.restore();
  }
});

test("github: metadata, tree and file content via the configured API base", async () => {
  const stub = stubFetch({
    "/repos/acme/app/git/trees": () => ({ json: { tree: [{ path: "src/auth/session.ts", type: "blob", size: 100 }, { path: "src", type: "tree" }] } }),
    "/repos/acme/app/contents/": () => ({ json: { content: Buffer.from("export const x = 1;").toString("base64"), encoding: "base64" } }),
    "/repos/acme/app": () => ({ json: { full_name: "acme/app", default_branch: "trunk", language: "TypeScript", stargazers_count: 3, html_url: "https://github.com/acme/app" } }),
  });
  try {
    const gh = new GitHubApiProvider("ghp_x", "https://ghe.example/api/v3");
    const info = await gh.getRepository("acme", "app");
    assert.equal(info.defaultBranch, "trunk");
    assert.ok(stub.calls[0].url.startsWith("https://ghe.example/api/v3/repos/acme/app"));
    assert.equal(stub.calls[0].headers.authorization, "Bearer ghp_x");
    const tree = await gh.getTree("acme", "app", "trunk");
    assert.equal(tree.length, 2);
    assert.equal(await gh.getFile("acme", "app", "src/auth/session.ts", "trunk"), "export const x = 1;");
    await assert.rejects(gh.getFile("acme", "app", "../etc/passwd", "trunk"), /Invalid file path/);
    await assert.rejects(gh.getRepository("bad owner", "app"), /owner\/name/);
  } finally {
    stub.restore();
  }
});

test("provider factory builds chains from the environment and reports availability", () => {
  for (const k of ["OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "TAVILY_API_KEY", "EXA_API_KEY", "JINA_API_KEY", "FIRECRAWL_API_KEY", "GITHUB_TOKEN", "SUPABASE_URL", "SUPABASE_SECRET_KEY"]) delete process.env[k];
  Object.assign(process.env, { OPENROUTER_API_KEY: "a", GROQ_API_KEY: "c", EXA_API_KEY: "e", FIRECRAWL_API_KEY: "f" });
  resetConfig();
  const p = createProviders();
  const by = Object.fromEntries(p.status.map((s) => [s.name, s]));
  assert.deepEqual(by.llm.chain, ["openrouter", "groq"]);
  assert.equal(by.llm.vendor, "openrouter");
  assert.deepEqual(p.llm?.vendors, ["openrouter", "groq"]);
  assert.deepEqual(by.search.chain, ["exa"]);
  assert.deepEqual(by.reader.chain, ["firecrawl"], "Firecrawl scrapes when Jina is absent");
  assert.equal(by.crawl.available, true);
  assert.equal(by.github.available, false);
  assert.match(by.github.reason ?? "", /GITHUB_TOKEN/);
  assert.equal(by.database.vendor, "file");
  assert.ok(!JSON.stringify(p.status).includes('"a"'));
  for (const k of ["OPENROUTER_API_KEY", "GROQ_API_KEY", "EXA_API_KEY", "FIRECRAWL_API_KEY"]) delete process.env[k];
  resetConfig();
});
