import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate } from "../src/server/tools/calculator";
import { parseRepo } from "../src/server/tools/github";
import { createDefaultRegistry } from "../src/server/tools/registry";
import { assertPublicUrl } from "../src/server/utils/http";
import { fresh } from "./helpers";

test("calculator evaluates arithmetic deterministically and rejects junk", () => {
  assert.equal(evaluate("1200 * 1.06 - 340"), 932);
  assert.equal(evaluate("12 % * 340"), 40.8);
  assert.equal(evaluate("(2 + 3) ^ 2 / 5"), 5);
  assert.throws(() => evaluate("process.exit(1)"), /unsupported|Malformed/);
  assert.throws(() => evaluate("1 / 0"), /Division by zero/);
  assert.throws(() => evaluate("(1 + 2"), /parentheses/);
});

test("registry lists tools with availability and validates input", () => {
  const { providers } = fresh();
  const registry = createDefaultRegistry();
  assert.deepEqual(registry.names().sort(), ["calculator", "data_analyze", "file_read", "github", "web_crawl", "web_read", "web_search"]);

  const listing = registry.list(providers);
  const byName = Object.fromEntries(listing.map((t) => [t.name, t]));
  assert.equal(byName.calculator.availability.available, true);
  assert.equal(byName.web_search.availability.available, false);
  assert.equal(providers.llm, null, "no model keys → no pool");
  assert.match(byName.web_search.availability.reason ?? "", /no search provider/i);
  assert.equal(byName.document_search.planned, true);

  assert.deepEqual(registry.validateInput("calculator", { expression: "1+1", extra: "dropped" }), { expression: "1+1" });
  assert.throws(() => registry.validateInput("calculator", {}), /required/);
  assert.throws(() => registry.validateInput("web_search", { query: 5 }), /must be a string/);
  assert.throws(() => registry.validateInput("github", { repo: "a/b", action: "delete" }), /one of/);
  assert.throws(() => registry.get("shell"), /Unknown tool/);
});

test("tools report provider unavailable instead of crashing", async () => {
  const { providers, registry } = fresh();
  const context = { runId: "run_x", userId: "u", providers, signal: new AbortController().signal, timeoutMs: 1000 };
  await assert.rejects(registry.get("web_search").execute({ query: "x" }, context), (e: Error & { code?: string }) => e.code === "PROVIDER_UNAVAILABLE");
  await assert.rejects(registry.get("web_read").execute({ url: "https://example.com" }, context), (e: Error & { code?: string }) => e.code === "PROVIDER_UNAVAILABLE");
  await assert.rejects(registry.get("github").execute({ repo: "a/b" }, context), (e: Error & { code?: string }) => e.code === "PROVIDER_UNAVAILABLE");
});

test("url and repo guards", () => {
  assert.equal(assertPublicUrl("https://example.com/x").href, "https://example.com/x");
  assert.throws(() => assertPublicUrl("http://localhost:3000"), /private or local/);
  assert.throws(() => assertPublicUrl("http://169.254.169.254/latest"), /private or local/);
  assert.throws(() => assertPublicUrl("ftp://example.com"), /http and https/);
  assert.deepEqual(parseRepo("https://github.com/acme/storefront.git"), { owner: "acme", repo: "storefront" });
  assert.throws(() => parseRepo("not a repo"), /owner\/name/);
});
