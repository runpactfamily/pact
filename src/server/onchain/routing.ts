// Host-based routing. Pure, so it can be tested without Next: the proxy turns
// the result into a rewrite, a redirect or a 404.
//
// - On the onchain host (ONCHAIN_HOST, or any "onchain." subdomain for local
//   testing) every page path is served from /onchain/*.
// - On the docs host (DOCS_HOST, or any "docs." subdomain) the root is the
//   documentation; every other page belongs to the main site and is sent there.
// - On the main site host /docs moves to the docs host and "www." moves to the
//   bare domain. Other hosts (workers.dev, localhost) keep /docs where it is.
// - On every host but the onchain one /onchain/* is hidden (404) unless
//   preview is on.
// - API routes and static assets are never touched.

export type SurfaceRoute =
  | { kind: "pass" }
  | { kind: "rewrite"; pathname: string }
  | { kind: "redirect"; pathname: string }
  /** Leave for another host. `host` carries no port; the proxy keeps the request's. */
  | { kind: "external"; host: string; pathname: string }
  | { kind: "block" };

export interface SurfaceRoutingConfig {
  onchainHost: string;
  preview: boolean;
  /** The docs host, e.g. docs.runpact.family. Without it the docs stay at /docs. */
  docsHost?: string;
  /** The main site host, e.g. runpact.family. Needed to move /docs and "www." off it. */
  siteHost?: string;
  /**
   * How a subdomain reaches its pages. "rewrite" keeps the URL clean and is
   * used in production. "redirect" is used by the dev server: the Fast
   * Refresh client reloads endlessly when the URL and the rendered route differ.
   */
  mode?: "rewrite" | "redirect";
}

const UNTOUCHED = /^\/(api|_next|icon\.svg|favicon\.ico|robots\.txt|sitemap\.xml|__hidden)(\/|$)/;

const hostName = (host: string) => host.toLowerCase().split(":")[0];
const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

export function isOnchainHost(host: string, onchainHost: string): boolean {
  const name = hostName(host);
  return name === onchainHost.toLowerCase() || name.startsWith("onchain.");
}

export function isDocsHost(host: string, docsHost?: string): boolean {
  const name = hostName(host);
  return (docsHost !== undefined && name === docsHost.toLowerCase()) || name.startsWith("docs.");
}

export function resolveSurfaceRoute(host: string, pathname: string, config: SurfaceRoutingConfig): SurfaceRoute {
  if (UNTOUCHED.test(pathname)) return { kind: "pass" };
  const name = hostName(host);
  const redirecting = config.mode === "redirect";

  if (isOnchainHost(host, config.onchainHost)) {
    if (under(pathname, "/onchain")) return { kind: "pass" };
    return { kind: redirecting ? "redirect" : "rewrite", pathname: pathname === "/" ? "/onchain" : `/onchain${pathname}` };
  }

  if (isDocsHost(host, config.docsHost)) {
    // The main site this docs host belongs to: the configured one, or the same name without "docs.".
    const site = config.docsHost && name === config.docsHost.toLowerCase() && config.siteHost ? config.siteHost.toLowerCase() : name.replace(/^docs\./, "");
    if (pathname === "/") return { kind: redirecting ? "redirect" : "rewrite", pathname: "/docs" };
    if (under(pathname, "/docs")) return redirecting ? { kind: "pass" } : { kind: "redirect", pathname: pathname.slice("/docs".length) || "/" };
    if (under(pathname, "/onchain")) return { kind: "block" };
    return { kind: "external", host: site, pathname };
  }

  if (under(pathname, "/onchain")) return config.preview ? { kind: "pass" } : { kind: "block" };

  const site = config.siteHost?.toLowerCase();
  if (site && !redirecting) {
    if (name === `www.${site}`) return { kind: "external", host: site, pathname };
    if (name === site && config.docsHost && under(pathname, "/docs")) return { kind: "external", host: config.docsHost.toLowerCase(), pathname: pathname.slice("/docs".length) || "/" };
  }
  return { kind: "pass" };
}
