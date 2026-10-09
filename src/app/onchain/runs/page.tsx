import type { Metadata } from "next";
import { OnchainRuns } from "@/components/onchain/OnchainRuns";

export const metadata: Metadata = { title: "Runs" };

export default function OnchainRunsPage() {
  return <OnchainRuns />;
}
