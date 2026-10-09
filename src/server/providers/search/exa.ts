import { PactError } from "../../errors";
import { fetchJson } from "../../utils/http";
import { sanitizeText } from "../../utils/text";
import type { SearchMode, SearchProvider, SearchResult } from "../types";

interface ExaResponse {
  results?: { title?: string | null; url?: string; publishedDate?: string | null; text?: string; score?: number }[];
}

/** Exa: neural/semantic search. Secondary to Tavily for keyword queries, first for semantic ones. */
export class ExaProvider implements SearchProvider {
  readonly vendor = "exa";

  constructor(private readonly apiKey: string) {}

  async search(query: string, options?: { maxResults?: number; timeoutMs?: number; mode?: SearchMode }): Promise<SearchResult[]> {
    const data = await fetchJson<ExaResponse>("https://api.exa.ai/search", {
      method: "POST",
      provider: "Exa",
      timeoutMs: options?.timeoutMs ?? 20_000,
      headers: { "x-api-key": this.apiKey },
      body: {
        query: query.slice(0, 400),
        numResults: Math.min(options?.maxResults ?? 5, 10),
        type: options?.mode === "semantic" ? "neural" : "auto",
        contents: { text: { maxCharacters: 600 } },
      },
    });
    if (!Array.isArray(data.results)) throw new PactError("MALFORMED_PROVIDER_RESPONSE", "Exa returned an unexpected shape.");
    return data.results
      .filter((r) => typeof r.url === "string" && r.url.startsWith("http"))
      .map((r) => ({
        title: sanitizeText(r.title ?? r.url ?? "", 200),
        url: r.url as string,
        snippet: sanitizeText(r.text ?? "", 600),
        source: this.vendor,
        publishedAt: r.publishedDate ?? undefined,
        score: typeof r.score === "number" ? r.score : undefined,
      }));
  }
}
