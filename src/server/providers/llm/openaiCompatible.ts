import { PactError } from "../../errors";
import { fetchJson } from "../../utils/http";
import type { LLMGenerateOptions, LLMGenerateResult, LLMProvider } from "../types";

// Chat Completions as served by OpenRouter and Groq. One adapter, two vendors.

interface ChatResponse {
  choices?: { message?: { content?: string | { text?: string }[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: string | number };
}

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    readonly vendor: string,
    private readonly label: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    readonly model: string,
    private readonly extraHeaders: Record<string, string> = {},
  ) {}

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
    const started = Date.now();
    const timeoutMs = options.timeoutMs ?? 60_000;
    const body = {
      model: this.model,
      messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxOutputTokens ?? 4096,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    };
    const headers = { authorization: `Bearer ${this.apiKey}`, ...this.extraHeaders };

    let data: ChatResponse;
    try {
      data = await fetchJson<ChatResponse>(`${this.baseUrl}/chat/completions`, { method: "POST", provider: this.label, timeoutMs, headers, body });
    } catch (error) {
      // Some models reject response_format; the prompt already demands JSON, so retry without it.
      if (options.json && error instanceof PactError && error.code === "PROVIDER_UNAVAILABLE" && (error.detail as { status?: number } | undefined)?.status === 400) {
        const { response_format: _dropped, ...plain } = body as typeof body & { response_format?: unknown };
        void _dropped;
        data = await fetchJson<ChatResponse>(`${this.baseUrl}/chat/completions`, { method: "POST", provider: this.label, timeoutMs, headers, body: plain });
      } else throw error;
    }

    if (data.error) {
      throw new PactError("PROVIDER_UNAVAILABLE", `${this.label} returned an error${data.error.message ? `: ${String(data.error.message).slice(0, 120)}` : "."}`, data.error);
    }
    const raw = data.choices?.[0]?.message?.content;
    const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p) => p.text ?? "").join("") : "";
    if (!text.trim()) throw new PactError("MALFORMED_PROVIDER_RESPONSE", `${this.label} returned an empty response.`);
    return {
      text,
      vendor: this.vendor,
      model: this.model,
      durationMs: Date.now() - started,
      usage: { inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens },
    };
  }
}
