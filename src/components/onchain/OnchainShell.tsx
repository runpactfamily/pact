"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { useChains } from "@/lib/pact/hooks";
import { CHAIN_IDS } from "@/lib/pact/types";
import { HomeIcon, PlusIcon, RunsIcon } from "../Icons";
import { Wordmark } from "../Wordmark";
import { CHAIN_NAMES, ChainIcon } from "./ChainIcon";

// The shell for Pact Onchain. Same bones as the app shell, inverted: ink
// paper, cream type, the four chains always in view.

/** Links are host-relative on the onchain host (where "/" is this surface) and /onchain-prefixed when previewed on the main host. */
export function useOnchainBase(): string {
  const pathname = usePathname();
  return pathname === "/onchain" || pathname.startsWith("/onchain/") ? "/onchain" : "";
}

export function OnchainShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const base = useOnchainBase();
  const chains = useChains();
  const home = base || "/";
  const nav = [
    { href: home, label: "Home", icon: HomeIcon, exact: true },
    { href: `${base}/runs`, label: "Runs", icon: RunsIcon, exact: false },
  ];
  const isActive = (item: (typeof nav)[number]) => (item.exact ? pathname === item.href || pathname === `${base}` : pathname.startsWith(item.href));

  function onNewRun(event: MouseEvent) {
    if (pathname !== home && pathname !== base) return;
    event.preventDefault();
    document.querySelector<HTMLTextAreaElement>(".composer__input")?.focus();
  }

  const links = nav.map((item) => {
    const Glyph = item.icon;
    const active = isActive(item);
    return (
      <Link key={item.label} href={item.href} className={cx("applink", active && "is-active")} aria-current={active ? "page" : undefined}>
        <Glyph />
        <span>{item.label}</span>
      </Link>
    );
  });

  return (
    <div className="shell shell--onchain">
      <aside className="side">
        <Link href={home} className="side__brand" aria-label="Pact Onchain, home">
          <Wordmark />
          <span className="side__badge side__badge--onchain label">Onchain</span>
        </Link>
        <Link href={home} className="btn btn--block side__new" onClick={onNewRun}>
          <PlusIcon />
          New run
        </Link>
        <nav className="side__nav" aria-label="Pact Onchain">
          {links}
        </nav>

        <div className="side__chains" aria-label="Chains">
          <p className="label side__chainslabel">Chains</p>
          <ul>
            {CHAIN_IDS.map((id) => {
              const entry = chains?.find((c) => c.id === id);
              const tone = !entry ? "loading" : entry.market && entry.explorer && entry.security ? "full" : "partial";
              return (
                <li key={id} className="side__chain">
                  <ChainIcon chain={id} size={18} />
                  <span className="side__chainname">{entry?.name ?? CHAIN_NAMES[id]}</span>
                  <span className={cx("side__chaindot", `is-${tone}`)} title={tone === "full" ? "Full coverage" : tone === "partial" ? "Partial coverage" : "Checking"} />
                </li>
              );
            })}
          </ul>
        </div>

        <div className="side__foot">
          <a href="https://docs.runpact.family/?section=onchain#onchain">Docs</a>
          <a href="https://runpact.family">Pact for everything else</a>
          <p>Public chain data only. Nothing here is investment advice, and Pact never holds keys or sends transactions.</p>
        </div>
      </aside>

      <header className="topbar">
        <Link href={home} aria-label="Pact Onchain, home" className="topbar__brand">
          <Wordmark />
          <span className="side__badge side__badge--onchain label">Onchain</span>
        </Link>
        <Link href={home} className="btn btn--sm" onClick={onNewRun}>
          <PlusIcon />
          New run
        </Link>
      </header>

      <main className="shell__main">{children}</main>

      <nav className="tabbar" aria-label="Pact Onchain, mobile">
        {links}
      </nav>
    </div>
  );
}
