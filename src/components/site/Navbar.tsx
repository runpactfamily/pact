"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_LINKS, SITE } from "@/content/site";
import { cx } from "@/lib/cx";
import { ArrowRight } from "../Icons";
import { Wordmark } from "../Wordmark";

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Close the menu when navigation happens (state adjusted during render, per React guidance).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={cx("nav", scrolled && "is-scrolled", open && "is-open")}>
      <div className="container">
        <div className="nav__card">
          <Link href="/" className="nav__brand" aria-label="Pact, home">
            <Wordmark />
          </Link>

          <nav className="nav__links" aria-label="Primary">
            {NAV_LINKS.map((link) =>
              link.external ? (
                <a key={link.href} href={link.href} className="nav__link">
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cx(
                    "nav__link",
                    pathname === link.href && "is-active",
                  )}
                  aria-current={pathname === link.href ? "page" : undefined}
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>

          <div className="nav__end">
            <Link href="/app" className="btn btn--sm nav__cta">
              Open Pact
              <ArrowRight />
            </Link>
            <button
              type="button"
              className="nav__toggle"
              aria-expanded={open}
              aria-controls="nav-menu"
              onClick={() => setOpen((value) => !value)}
            >
              {open ? "Close" : "Menu"}
            </button>
          </div>
        </div>
      </div>

      <div id="nav-menu" className="nav__menu" hidden={!open}>
        <nav className="container nav__menulinks" aria-label="Primary, mobile">
          {NAV_LINKS.map((link, i) =>
            link.external ? (
              <a key={link.href} href={link.href} className="nav__menulink">
                <span className="label">{String(i + 1).padStart(2, "0")}</span>
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="nav__menulink"
                onClick={() => setOpen(false)}
              >
                <span className="label">{String(i + 1).padStart(2, "0")}</span>
                {link.label}
              </Link>
            ),
          )}
        </nav>
        <div className="container nav__menufoot">
          <a
            href={SITE.xUrl}
            target="_blank"
            rel="noreferrer"
            className="label"
          >
            X {SITE.xHandle}
          </a>
          <a href={SITE.githubUrl} target="_blank" rel="noreferrer" className="label">
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
}
