import { OpenAICompatibleProvider } from "./openaiCompatible";

/** OpenRouter: primary language model. Model is configured, never hardcoded in the agent. */
export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, model: string) {
    super("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", apiKey, model, {
      "http-referer": "https://runpact.family",
      "x-title": "Pact",
    });
  }
}
