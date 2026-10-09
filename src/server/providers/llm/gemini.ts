import { PactError } from "../../errors";
import { fetchJson } from "../../utils/http";
import type { LLMGenerateOptions, LLMGenerateResult, LLMProvider } from "../types";

// Google Gemini over the REST API: first fallback. The key travels only in
// the query string of this request and is never logged.

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export class GeminiProvider implements LLMProvider {
  readonly vendor = "gemini";

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
    const started = Date.now();
    const system = options.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const user = options.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n\n");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const data = await fetchJson<GeminiResponse>(url, {
      method: "POST",
      provider: "Gemini",
      timeoutMs: options.timeoutMs ?? 60_000,
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxOutputTokens ?? 4096,
          ...(options.json ? { responseMimeType: "application/json" } : {}),
        },
      },
    });

    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) throw new PactError("MALFORMED_PROVIDER_RESPONSE", "Gemini returned an empty response.");
    return {
      text,
      vendor: this.vendor,
      model: this.model,
      durationMs: Date.now() - started,
      usage: { inputTokens: data.usageMetadata?.promptTokenCount, outputTokens: data.usageMetadata?.candidatesTokenCount },
    };
  }
}
