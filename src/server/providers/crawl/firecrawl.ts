import { PactError } from "../../errors";
import { assertPublicUrl, fetchJson } from "../../utils/http";
import { sanitizeText } from "../../utils/text";
import type { CrawlProvider, ReaderProvider, ReadResult } from "../types";

// Firecrawl: /v1/scrape for one page (used as the reader fallback) and
// /v1/map + /v1/scrape for a bounded multi-page crawl. Never used for every
// URL; the reader router and the web_crawl tool decide when it is worth it.

interface ScrapeResponse {
  success?: boolean;
  data?: { markdown?: string; metadata?: { title?: string; description?: string; sourceURL?: string; publishedTime?: string } };
  error?: string;
}

interface MapResponse {
  success?: boolean;
  links?: string[];
  error?: string;
}

const BASE = "https://api.firecrawl.dev/v1";

export class FirecrawlProvider implements ReaderProvider, CrawlProvider {
  readonly vendor = "firecrawl";

  constructor(private readonly apiKey: string) {}

  private headers() {
    return { authorization: `Bearer ${this.apiKey}` };
  }

  async read(url: string, options?: { timeoutMs?: number; maxChars?: number }): Promise<ReadResult> {
    const target = assertPublicUrl(url);
    const data = await fetchJson<ScrapeResponse>(`${BASE}/scrape`, {
      method: "POST",
      provider: "Firecrawl",
      timeoutMs: options?.timeoutMs ?? 30_000,
      headers: this.headers(),
      body: { url: target.href, formats: ["markdown"], onlyMainContent: true },
    });
    if (!data.success || !data.data) throw new PactError("PROVIDER_UNAVAILABLE", `Firecrawl could not read the page${data.error ? `: ${String(data.error).slice(0, 100)}` : "."}`);
    const content = sanitizeText(data.data.markdown ?? "", options?.maxChars ?? 24_000);
    if (content.length < 40) throw new PactError("PROVIDER_UNAVAILABLE", "The page returned no readable content.", { url: target.href });
    const meta = data.data.metadata ?? {};
    return {
      url: meta.sourceURL ?? target.href,
      title: meta.title ? sanitizeText(meta.title, 200) : undefined,
      content,
      metadata: { provider: this.vendor, chars: content.length, retrievedAt: new Date().toISOString(), publishedAt: meta.publishedTime, description: meta.description },
    };
  }

  async crawl(url: string, options?: { maxPages?: number; timeoutMs?: number; maxChars?: number }): Promise<ReadResult[]> {
    const target = assertPublicUrl(url);
    const maxPages = Math.max(1, Math.min(options?.maxPages ?? 5, 20));
    const map = await fetchJson<MapResponse>(`${BASE}/map`, {
      method: "POST",
      provider: "Firecrawl",
      timeoutMs: options?.timeoutMs ?? 30_000,
      headers: this.headers(),
      body: { url: target.href, limit: Math.min(maxPages * 4, 100) },
    });
    if (!map.success || !Array.isArray(map.links)) throw new PactError("MALFORMED_PROVIDER_RESPONSE", "Firecrawl returned an unexpected site map.");

    // The start page first, then same-host links in the order the site lists them.
    const seen = new Set<string>();
    const picks: string[] = [];
    for (const link of [target.href, ...map.links]) {
      try {
        const u = new URL(link);
        if (u.hostname !== target.hostname) continue;
        u.hash = "";
        if (seen.has(u.href)) continue;
        seen.add(u.href);
        picks.push(u.href);
      } catch {
        // Skip malformed links.
      }
      if (picks.length >= maxPages) break;
    }

    const pages: ReadResult[] = [];
    for (const page of picks) {
      try {
        pages.push(await this.read(page, { timeoutMs: options?.timeoutMs, maxChars: options?.maxChars }));
      } catch {
        // One unreadable page does not fail the crawl.
      }
    }
    if (!pages.length) throw new PactError("PROVIDER_UNAVAILABLE", "None of the discovered pages could be read.");
    return pages;
  }
}
