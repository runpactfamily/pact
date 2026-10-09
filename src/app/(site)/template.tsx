import type { ReactNode } from "react";

// Remounts on every navigation, which replays the page-enter transition.
export default function SiteTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
