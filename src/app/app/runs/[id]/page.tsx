import type { Metadata } from "next";
import { RunView } from "@/components/app/RunView";

export const metadata: Metadata = { title: "Run" };

export default function RunPage() {
  return <RunView />;
}
