"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { HomeIcon, IntegrationsIcon, LibraryIcon, PlusIcon, RunsIcon } from "../Icons";
import { Wordmark } from "../Wordmark";

const NAV = [
  { href: "/app", label: "Home", icon: HomeIcon, exact: true },
  { href: "/app/runs", label: "Runs", icon: RunsIcon },
  { href: "/app/library", label: "Library", icon: LibraryIcon },
  { href: "/app/integrations", label: "Integrations", icon: IntegrationsIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (item: (typeof NAV)[number]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  // Already on Home: "New run" should put the cursor in the input.
  function onNewRun(event: MouseEvent) {
    if (pathname !== "/app") return;
    event.preventDefault();
    document.querySelector<HTMLTextAreaElement>(".composer__input")?.focus();
  }

  const links = NAV.map((item) => {
    const Glyph = item.icon;
    const active = isActive(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cx("applink", active && "is-active")}
        aria-current={active ? "page" : undefined}
      >
        <Glyph />
        <span>{item.label}</span>
      </Link>
    );
  });

  return (
    <div className="shell">
      <aside className="side">
        <Link href="/app" className="side__brand" aria-label="Pact, app home">
          <Wordmark />
          <span className="side__badge label">Preview</span>
        </Link>
        <Link href="/app" className="btn btn--block side__new" onClick={onNewRun}>
          <PlusIcon />
          New run
        </Link>
        <nav className="side__nav" aria-label="App">
          {links}
        </nav>
        <div className="side__foot">
          <Link href="/docs">Docs</Link>
          <Link href="/">Back to site</Link>
          <p>Preview build. Results depend on which providers are configured.</p>
        </div>
      </aside>

      <header className="topbar">
        <Link href="/app" aria-label="Pact, app home">
          <Wordmark />
        </Link>
        <Link href="/app" className="btn btn--sm" onClick={onNewRun}>
          <PlusIcon />
          New run
        </Link>
      </header>

      <main className="shell__main">{children}</main>

      <nav className="tabbar" aria-label="App, mobile">
        {links}
      </nav>
    </div>
  );
}
