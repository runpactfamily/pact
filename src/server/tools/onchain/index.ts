import type { AnyTool } from "../registry";
import { compareTokensTool } from "./compareTokens";
import { defiOverviewTool } from "./defiOverview";
import { largeTradesTool } from "./largeTrades";
import { priceHistoryTool } from "./priceHistory";
import { walletSafetyTool } from "./walletSafety";
import { marketOverviewTool } from "./marketOverview";
import { newTokensTool } from "./newTokens";
import { tokenLookupTool } from "./tokenLookup";
import { tokenScreenerTool } from "./tokenScreener";
import { tokenSecurityTool } from "./tokenSecurity";
import { txExplainTool } from "./txExplain";
import { volumeTrackTool } from "./volumeTrack";
import { walletInspectTool } from "./walletInspect";

/** The onchain tool set, registered only for runs from the onchain surface. */
export const ONCHAIN_TOOLS: AnyTool[] = [
  tokenLookupTool,
  tokenSecurityTool,
  priceHistoryTool,
  volumeTrackTool,
  largeTradesTool,
  compareTokensTool,
  marketOverviewTool,
  newTokensTool,
  tokenScreenerTool,
  defiOverviewTool,
  walletInspectTool,
  walletSafetyTool,
  txExplainTool,
];

export const ONCHAIN_TOOL_NAMES = new Set(ONCHAIN_TOOLS.map((t) => t.name));
