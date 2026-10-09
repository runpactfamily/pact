// Human names for model ids. Shared by the server (run metadata) and the UI.

export type VendorId = "openrouter" | "gemini" | "groq";

export const VENDOR_LABELS: Record<VendorId, string> = {
  openrouter: "OpenRouter",
  gemini: "Gemini",
  groq: "Groq",
};

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** "anthropic/claude-sonnet-5.5" → "Claude Sonnet 5.5", "gemini-3.8-flash" → "Gemini 3.8 Flash", "openai/gpt-oss-120b" → "GPT-OSS 120B". */
export function modelLabel(model: string): string {
  const bare = model.split("/").pop()?.replace(/:free$/, "") ?? model;
  if (/^claude-/.test(bare)) return titleCase(bare.replace(/^claude-/, "claude ").replace(/-/g, " "));
  if (/^gemini-/.test(bare)) return titleCase(bare.replace(/-/g, " "));
  if (/gpt-oss/.test(bare)) return bare.replace(/gpt-oss-(\d+)b/i, "GPT-OSS $1B");
  return titleCase(bare.replace(/[-_]/g, " "));
}

/** What people see: the model, never the vendor that hosts it. */
export function modelDisplay(llm: { vendor: string; model: string } | undefined): string | null {
  return llm ? modelLabel(llm.model) : null;
}

/** Group heading for a vendor's models in the selector, by what they are rather than who serves them. */
export function modelGroupLabel(vendor: VendorId): string {
  return vendor === "openrouter" ? "Claude" : vendor === "gemini" ? "Gemini" : "Open-weight models";
}
