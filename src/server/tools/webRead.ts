import { getConfig } from "../config";
import { PactError } from "../errors";
import { assertPublicUrl } from "../utils/http";
import type { Tool } from "./types";

export const webReadTool: Tool<{ url: string }, { url: string; title?: string; chars: number; provider: string }> = {
  name: "web_read",
  description: "Fetch one web page and return its readable text.",
  stage: "researching",
  inputSchema: { type: "object", properties: { url: { type: "string", description: "http(s) URL" } }, required: ["url"] },
  outputSchema: { type: "object", properties: { url: { type: "string" }, title: { type: "string" }, chars: { type: "number" }, provider: { type: "string" } } },
  isAvailable: (providers) =>
    providers.reader ? { available: true } : { available: false, reason: "Reading web pages is unavailable: no reader provider is configured." },
  async execute(input, context) {
    const provider = context.providers.reader;
    if (!provider) throw new PactError("PROVIDER_UNAVAILABLE", "Reading web pages is temporarily unavailable.");
    const url = assertPublicUrl(input.url).href;
    const page = await provider.read(url, { timeoutMs: context.timeoutMs, maxChars: getConfig().limits.maxSourceChars * 2 });
    return {
      data: { url: page.url, title: page.title, chars: page.content.length, provider: page.metadata.provider },
      summary: `Read ${page.title ? `“${page.title}”` : page.url} (${page.content.length.toLocaleString("en-US")} characters)`,
      evidence: [{ kind: "page", label: page.title || page.url, url: page.url, text: page.content, provider: page.metadata.provider, publishedAt: page.metadata.publishedAt }],
    };
  },
};
