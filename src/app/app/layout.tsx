import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import "./app.css";

export const metadata: Metadata = {
  title: { default: "App", template: "%s — Pact" },
  robots: { index: false },
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
