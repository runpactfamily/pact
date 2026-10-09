import { Suspense } from "react";
import { HomeView } from "@/components/app/HomeView";

export default function AppHomePage() {
  return (
    <Suspense fallback={null}>
      <HomeView />
    </Suspense>
  );
}
