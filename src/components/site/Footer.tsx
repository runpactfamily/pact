import Link from "next/link";
import { FOOTER_GROUPS, LEGAL_LINKS } from "@/content/site";
import { ArrowRight } from "../Icons";
import { Wordmark } from "../Wordmark";

export function Footer() {
  return (
    <footer className="footer dark">
      <div className="container">
        <div className="footer__top">
          <div className="footer__brand">
            <Wordmark />
            <p className="footer__desc">
              An autonomous agent that takes a job, understands the context, works through it, and returns the result. Pact Onchain does the same for public blockchain data on four chains.
            </p>
            <p className="footer__status">
              <span className="footer__statusdot" aria-hidden="true" />
              Preview build
            </p>
          </div>

          <div className="footer__groups">
            {FOOTER_GROUPS.map((group) => (
              <nav key={group.title} className="footer__col" aria-label={group.title}>
                <p className="label">{group.title}</p>
                {group.links.map((link) =>
                  "external" in link && link.external ? (
                    <a key={link.href + link.label} href={link.href} target="_blank" rel="noreferrer">
                      {link.label}
                      <ArrowRight className="footer__ext" />
                    </a>
                  ) : (
                    <Link key={link.href + link.label} href={link.href}>
                      {link.label}
                    </Link>
                  ),
                )}
              </nav>
            ))}
          </div>
        </div>

        <p className="footer__mark" aria-hidden="true">
          Pact
        </p>

        <div className="footer__base label">
          <span>© 2026 Pact</span>
          <nav className="footer__legal" aria-label="Legal">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
          <span>Give it a job.</span>
        </div>
      </div>
    </footer>
  );
}
