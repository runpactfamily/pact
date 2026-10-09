import { Suspense } from "react";
import { OnchainHome } from "@/components/onchain/OnchainHome";

export default function OnchainHomePage() {
  return (
    <Suspense fallback={null}>
      <OnchainHome />
    </Suspense>
  );
}
