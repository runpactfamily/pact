import { handler, json } from "@/server/api";
import { allChainCapabilities } from "@/server/onchain/index";

export const dynamic = "force-dynamic";

/** GET /api/onchain/chains — the chains Pact Onchain supports and what each can do with the configured keys. */
export const GET = handler(async () => {
  return json({ chains: allChainCapabilities() });
});
