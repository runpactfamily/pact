import { PactError } from "../../errors";
import { fetchJson } from "../../utils/http";
import { sanitizeText } from "../../utils/text";
import type { SearchProvider, SearchResult } from "../types";

interface TavilyResponse {
  results?: { title?: string; url?: string; content?: string; score?: number; published_date?: string }[];
}

/** Tavily: primary web search. */
export class TavilyProvider implements SearchProvider {
  readonly vendor = "tavily";

  constructor(private readonly apiKey: string) {}

  async search(query: string, options?: { maxResults?: number; timeoutMs?: number }): Promise<SearchResult[]> {
    const data = await fetchJson<TavilyResponse>("https://api.tavily.com/search", {
      method: "POST",
      provider: "Tavily",
      timeoutMs: options?.timeoutMs ?? 20_000,
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: {
        query: query.slice(0, 400),
        max_results: Math.min(options?.maxResults ?? 5, 10),
        search_depth: "basic",
        include_answer: false,
      },
    });
    if (!Array.isArray(data.results)) throw new PactError("MALFORMED_PROVIDER_RESPONSE", "Tavily returned an unexpected shape.");
    return data.results
      .filter((r) => typeof r.url === "string" && r.url.startsWith("http"))
      .map((r) => ({
        title: sanitizeText(r.title ?? r.url ?? "", 200),
        url: r.url as string,
        snippet: sanitizeText(r.content ?? "", 600),
        source: this.vendor,
        publishedAt: r.published_date ?? undefined,
        score: typeof r.score === "number" ? r.score : undefined,
      }));
  }
}
