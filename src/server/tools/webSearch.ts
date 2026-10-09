import { getConfig } from "../config";
import { PactError } from "../errors";
import type { SearchResult } from "../providers/types";
import type { Tool } from "./types";

interface Input {
  query: string;
  maxResults?: number;
  mode?: "keyword" | "semantic";
}

export const webSearchTool: Tool<Input, { query: string; mode: string; results: SearchResult[]; source?: string }> = {
  name: "web_search",
  description: "Search the web for pages relevant to a query. Use mode=semantic for 'things like this' questions.",
  stage: "researching",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to search for" },
      maxResults: { type: "number", description: "1–10" },
      mode: { type: "string", enum: ["keyword", "semantic"], description: "default keyword" },
    },
    required: ["query"],
  },
  outputSchema: { type: "object", properties: { query: { type: "string" }, mode: { type: "string" }, results: { type: "array", items: { type: "object" } }, source: { type: "string" } } },
  isAvailable: (providers) =>
    providers.search ? { available: true } : { available: false, reason: "Web research is unavailable: no search provider is configured." },
  async execute(input, context) {
    const provider = context.providers.search;
    if (!provider) throw new PactError("PROVIDER_UNAVAILABLE", "Web research is temporarily unavailable.");
    const query = input.query.trim().slice(0, 400);
    if (!query) throw new PactError("INVALID_REQUEST", "Search query is empty.");
    const limit = getConfig().limits.maxSearchResults;
    const mode = input.mode ?? "keyword";
    const results = await provider.search(query, { maxResults: Math.min(input.maxResults ?? limit, limit), timeoutMs: context.timeoutMs, mode });
    return {
      data: { query, mode, results, source: results[0]?.source },
      summary: `Found ${results.length} ${results.length === 1 ? "result" : "results"} for “${query}”${results[0] ? ` via ${results[0].source}` : ""}`,
      evidence: results.map((r) => ({
        kind: "search" as const,
        label: r.title || r.url,
        url: r.url,
        text: r.snippet,
        provider: r.source,
        publishedAt: r.publishedAt,
      })),
    };
  },
};
