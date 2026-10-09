import { handler, json } from "@/server/api";
import { getProviders } from "@/server/providers";

export const dynamic = "force-dynamic";

/** GET /api/models — live model lists per configured vendor, cached server-side. No secrets. */
export const GET = handler(async (request: Request) => {
  const providers = getProviders();
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  const catalog = providers.llm ? await providers.llm.catalog() : { fetchedAt: Date.now(), vendors: [] };
  void force;
  const vendors = (["openrouter", "gemini", "groq"] as const).map((vendor) => {
    const entry = catalog.vendors.find((v) => v.vendor === vendor);
    const configured = providers.llm?.vendors.includes(vendor) ?? false;
    const models = (entry?.models ?? []).filter((m) => (vendor === "openrouter" ? m.family === "claude" : true)).slice(0, 12);
    return {
      vendor,
      available: configured && (entry?.available ?? false),
      reason: !configured ? "API key is not set" : entry?.reason,
      models: models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength, pricing: m.pricing })),
    };
  });
  return json({ fetchedAt: catalog.fetchedAt, vendors }, 200, { "cache-control": "private, max-age=300" });
});
