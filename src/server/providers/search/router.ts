import { isRecoverableProviderError, PactError } from "../../errors";
import { log } from "../../log";
import type { SearchMode, SearchProvider, SearchResult } from "../types";

// Tavily first for ordinary queries, Exa first for semantic ones; whichever
// is second is the fallback. Results carry the vendor that produced them.

export class SearchRouter implements SearchProvider {
  readonly vendor: string;

  constructor(private readonly chain: SearchProvider[]) {
    if (chain.length === 0) throw new Error("SearchRouter needs at least one provider");
    this.vendor = chain[0].vendor;
  }

  get vendors(): string[] {
    return this.chain.map((p) => p.vendor);
  }

  async search(query: string, options?: { maxResults?: number; timeoutMs?: number; mode?: SearchMode }): Promise<SearchResult[]> {
    const semantic = this.chain.find((p) => p.vendor === "exa");
    const order = options?.mode === "semantic" && semantic ? [semantic, ...this.chain.filter((p) => p !== semantic)] : this.chain;
    let last: unknown;
    for (const provider of order) {
      try {
        return await provider.search(query, options);
      } catch (error) {
        if (!isRecoverableProviderError(error)) throw error;
        last = error;
        log.warn("search.failover", { provider: provider.vendor, code: (error as PactError).code });
      }
    }
    throw last instanceof PactError ? last : new PactError("PROVIDER_UNAVAILABLE", "Web search is temporarily unavailable.");
  }
}
