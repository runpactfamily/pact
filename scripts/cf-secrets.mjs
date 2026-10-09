// Uploads the provider keys from .env.local to the Worker as secrets.
// Usage: node scripts/cf-secrets.mjs            (reads .env.local, runs `wrangler secret bulk`)
// Values are never printed.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

const WANTED = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "OPENROUTER_MODEL_COMPLEX",
  "OPENROUTER_MODEL_LIGHT",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "TAVILY_API_KEY",
  "EXA_API_KEY",
  "JINA_API_KEY",
  "FIRECRAWL_API_KEY",
  "GITHUB_TOKEN",
  "GITHUB_API_URL",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "BLOCKSCOUT_API_KEY",
  "ANKR_API_KEY",
  "ALCHEMY_API_KEY",
  "NODEREAL_API_KEY",
  "COINGECKO_API_KEY",
  "CODEX_API_KEY",
  "HELIUS_API_KEY",
];

const env = readFileSync(".env.local", "utf8");
const secrets = {};
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m || !WANTED.includes(m[1])) continue;
  const value = m[2].trim();
  if (value) secrets[m[1]] = value;
}
const tmp = path.join(os.tmpdir(), `pact-secrets-${process.pid}.json`);
writeFileSync(tmp, JSON.stringify(secrets));
try {
  console.log(`uploading ${Object.keys(secrets).length} secrets: ${Object.keys(secrets).join(", ")}`);
  const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", "secret", "bulk", tmp], { stdio: "inherit", shell: process.platform === "win32" });
  process.exitCode = r.status ?? 1;
} finally {
  unlinkSync(tmp);
}
