import type { Metadata } from "next";
import { OnchainRun } from "@/components/onchain/OnchainRuns";

export const metadata: Metadata = { title: "Run" };

export default function OnchainRunPage() {
  return <OnchainRun />;
}
