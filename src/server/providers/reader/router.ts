import { isRecoverableProviderError, PactError } from "../../errors";
import { log } from "../../log";
import type { ReaderProvider, ReadResult } from "../types";

/** Jina first; Firecrawl's scraper only when Jina cannot read the page. */
export class ReaderRouter implements ReaderProvider {
  readonly vendor: string;

  constructor(private readonly chain: ReaderProvider[]) {
    if (chain.length === 0) throw new Error("ReaderRouter needs at least one provider");
    this.vendor = chain[0].vendor;
  }

  get vendors(): string[] {
    return this.chain.map((p) => p.vendor);
  }

  async read(url: string, options?: { timeoutMs?: number; maxChars?: number }): Promise<ReadResult> {
    let last: unknown;
    for (const provider of this.chain) {
      try {
        return await provider.read(url, options);
      } catch (error) {
        if (!isRecoverableProviderError(error)) throw error;
        last = error;
        log.warn("reader.failover", { provider: provider.vendor, code: (error as PactError).code });
      }
    }
    throw last instanceof PactError ? last : new PactError("PROVIDER_UNAVAILABLE", "Reading web pages is temporarily unavailable.");
  }
}
