import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OnchainShell } from "@/components/onchain/OnchainShell";
import "../app/app.css";
import "./onchain.css";

// Pact Onchain. Served on its own host (see src/proxy.ts) and linked from
// the main site's docs and footer.
export const metadata: Metadata = {
  title: { default: "Pact Onchain", template: "%s — Pact Onchain" },
  description: "Give Pact an onchain job: tokens, wallets, transactions and markets across Robinhood Chain, Base, BNB Chain and Solana.",
};

export default function OnchainLayout({ children }: { children: ReactNode }) {
  return <OnchainShell>{children}</OnchainShell>;
}
