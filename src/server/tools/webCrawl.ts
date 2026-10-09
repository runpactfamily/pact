import { getConfig } from "../config";
import { PactError } from "../errors";
import { assertPublicUrl } from "../utils/http";
import type { Tool } from "./types";

interface Input {
  url: string;
  maxPages?: number;
}

/** Bounded multi-page crawl. Only planned when a job asks to explore a site, never for a single page. */
export const webCrawlTool: Tool<Input, { url: string; pages: number; provider: string }> = {
  name: "web_crawl",
  description: "Explore a website: discover pages under a URL and read several of them. Use only when one page is not enough.",
  stage: "researching",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string", description: "Start URL" }, maxPages: { type: "number", description: "Pages to read, bounded by MAX_CRAWL_PAGES" } },
    required: ["url"],
  },
  outputSchema: { type: "object", properties: { url: { type: "string" }, pages: { type: "number" }, provider: { type: "string" } } },
  isAvailable: (providers) =>
    providers.crawl ? { available: true } : { available: false, reason: "Site crawling is unavailable: FIRECRAWL_API_KEY is not set." },
  async execute(input, context) {
    const provider = context.providers.crawl;
    if (!provider) throw new PactError("PROVIDER_UNAVAILABLE", "Site crawling is temporarily unavailable.");
    const url = assertPublicUrl(input.url).href;
    const limit = getConfig().limits.maxCrawlPages;
    const pages = await provider.crawl(url, { maxPages: Math.min(input.maxPages ?? limit, limit), timeoutMs: context.timeoutMs, maxChars: getConfig().limits.maxSourceChars });
    return {
      data: { url, pages: pages.length, provider: provider.vendor },
      summary: `Crawled ${pages.length} ${pages.length === 1 ? "page" : "pages"} under ${new URL(url).hostname}`,
      evidence: pages.map((p) => ({ kind: "page" as const, label: p.title || p.url, url: p.url, text: p.content, provider: p.metadata.provider, publishedAt: p.metadata.publishedAt })),
    };
  },
};
