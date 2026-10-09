import type { ReactNode } from "react";

// Remounts on navigation so only the main area transitions; the shell stays put.
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
