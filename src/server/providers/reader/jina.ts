import { PactError } from "../../errors";
import { assertPublicUrl, fetchText } from "../../utils/http";
import { sanitizeText } from "../../utils/text";
import type { ReaderProvider, ReadResult } from "../types";

// Jina Reader: GET https://r.jina.ai/<url> returns the page as markdown.

export class JinaReaderProvider implements ReaderProvider {
  readonly vendor = "jina";

  constructor(private readonly apiKey: string) {}

  async read(url: string, options?: { timeoutMs?: number; maxChars?: number }): Promise<ReadResult> {
    const target = assertPublicUrl(url);
    const raw = await fetchText(`https://r.jina.ai/${target.href}`, {
      provider: "Jina Reader",
      timeoutMs: options?.timeoutMs ?? 25_000,
      headers: { authorization: `Bearer ${this.apiKey}`, accept: "text/plain", "x-return-format": "markdown" },
    });
    const header = (name: string) => raw.match(new RegExp(`^${name}:\\s*(.+)$`, "m"))?.[1]?.trim();
    const title = header("Title");
    const published = header("Published Time");
    const body = raw.replace(/^(Title|URL Source|Published Time|Description):.*$/gm, "").replace(/^Markdown Content:\s*$/m, "");
    const content = sanitizeText(body, options?.maxChars ?? 24_000);
    if (content.length < 40) throw new PactError("PROVIDER_UNAVAILABLE", "The page returned no readable content.", { url: target.href });
    return {
      url: target.href,
      title: title ? sanitizeText(title, 200) : undefined,
      content,
      metadata: { provider: this.vendor, chars: content.length, retrievedAt: new Date().toISOString(), publishedAt: published, description: header("Description") },
    };
  }
}
