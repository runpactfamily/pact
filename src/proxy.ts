import { NextResponse, type NextRequest } from "next/server";
import { resolveSurfaceRoute } from "@/server/onchain/routing";

// Hosts: Pact Onchain and the docs each live on their own subdomain. This is
// the only place that knows; the pages themselves are ordinary routes.

export default function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const route = resolveSurfaceRoute(host, request.nextUrl.pathname, {
    onchainHost: (process.env.ONCHAIN_HOST?.trim() || "onchain.runpact.family").toLowerCase(),
    docsHost: (process.env.DOCS_HOST?.trim() || "docs.runpact.family").toLowerCase(),
    siteHost: (process.env.SITE_HOST?.trim() || "runpact.family").toLowerCase(),
    preview: process.env.PACT_ONCHAIN_PREVIEW === "1" || process.env.PACT_ONCHAIN_PREVIEW === "true",
    mode: process.env.NODE_ENV === "development" ? "redirect" : "rewrite",
  });
  if (route.kind === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = route.pathname;
    return NextResponse.redirect(url, 307);
  }
  if (route.kind === "external") {
    // Same scheme and port as the request, another host.
    const port = host.includes(":") ? host.slice(host.lastIndexOf(":")) : "";
    const target = new URL(`${request.nextUrl.protocol}//${route.host}${port}${route.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(target, 308);
  }
  if (route.kind === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = route.pathname;
    return NextResponse.rewrite(url);
  }
  if (route.kind === "block") {
    const url = request.nextUrl.clone();
    url.pathname = "/__hidden";
    return NextResponse.rewrite(url, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
