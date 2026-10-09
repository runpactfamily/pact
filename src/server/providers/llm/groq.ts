import { OpenAICompatibleProvider } from "./openaiCompatible";

/** Groq: secondary fallback language model. */
export class GroqProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, model: string) {
    super("groq", "Groq", "https://api.groq.com/openai/v1", apiKey, model);
  }
}
