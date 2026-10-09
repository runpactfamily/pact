import { isRecoverableProviderError, PactError } from "../../errors";
import { log } from "../../log";
import type { LLMGenerateOptions, LLMGenerateResult, LLMProvider } from "../types";

// Tries providers in order. A recoverable failure (outage, rate limit,
// timeout, unreadable reply) moves to the next one; anything else is the
// caller's problem and is thrown as is. The agent only ever sees this class.

export class LLMRouter implements LLMProvider {
  readonly vendor: string;
  readonly model: string;

  constructor(private readonly chain: LLMProvider[]) {
    if (chain.length === 0) throw new Error("LLMRouter needs at least one provider");
    this.vendor = chain[0].vendor;
    this.model = chain[0].model;
  }

  get vendors(): string[] {
    return this.chain.map((p) => p.vendor);
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
    const failovers: { vendor: string; code: string }[] = [];
    for (const [i, provider] of this.chain.entries()) {
      try {
        const result = await provider.generate(options);
        return failovers.length ? { ...result, failovers } : result;
      } catch (error) {
        if (!isRecoverableProviderError(error)) throw error;
        const code = (error as PactError).code;
        failovers.push({ vendor: provider.vendor, code });
        const detail = (error as PactError).detail as { status?: number; body?: string } | undefined;
        log.warn("llm.failover", { provider: provider.vendor, model: provider.model, code, status: detail?.status === undefined ? undefined : String(detail.status), detail: detail?.body ?? (error as PactError).message });
        const next = this.chain[i + 1];
        options.onFailover?.({ from: { vendor: provider.vendor, model: provider.model }, to: next ? { vendor: next.vendor, model: next.model } : null, code });
      }
    }
    throw new PactError("AGENT_PROVIDER_UNAVAILABLE", "Unable to complete this run because the available reasoning providers are unavailable.", failovers);
  }
}
