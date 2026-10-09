import { handler, json } from "@/server/api";
import { getConfig } from "@/server/config";
import { getProviders, vendorAvailability } from "@/server/providers";
import { getStorage, storageReady } from "@/server/storage";
import { allChainCapabilities } from "@/server/onchain/index";
import { ONCHAIN_TOOL_NAMES } from "@/server/tools/onchain/index";
import { getRegistry } from "@/server/tools/registry";

export const dynamic = "force-dynamic";

/** GET /api/health — mode, provider availability, storage in use, tool listing. Never includes secrets. */
export const GET = handler(async () => {
  const config = getConfig();
  const providers = getProviders();
  await storageReady();
  const storage = getStorage().kind;
  const database = await getStorage().ping();
  return json({
    status: database ? "ok" : "degraded",
    ok: database,
    mode: config.mode,
    storage,
    database: { kind: storage, reachable: database },
    providers: { ...vendorAvailability(), supabase: storage === "supabase" && database },
    details: providers.status.map((s) => (s.name === "database" ? { ...s, vendor: storage, available: database, reason: database ? undefined : "The database could not be reached" } : s)),
    limits: config.limits,
    tools: getRegistry().list(providers),
    onchain: {
      host: config.onchain.host,
      preview: config.onchain.preview,
      chains: allChainCapabilities(),
      tools: getRegistry("onchain").list(providers).filter((t) => ONCHAIN_TOOL_NAMES.has(t.name)),
    },
  });
});
