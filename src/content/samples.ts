import type { RunResult } from "@/lib/pact/types";

// Illustrative results shown on the marketing site only (the product preview
// and the "Real work" spread). They are written copy, never produced by or
// served from the application; /app only ever shows real runs.

export const SAMPLE_PAYMENTS: RunResult = {
  title: "Payment Infrastructure Recommendation",
  summary:
    "For a SaaS billing customers in both the UK and the US, no single provider covers both markets well. The global processors handle US cards and subscriptions cleanly but leave UK bank transfer and e-wallet payments thin. The workable setup is one global processor for cards and recurring billing, paired with a local aggregator for UK payment methods, behind one internal billing layer.",
  highlights: [
    { value: "2", label: "Providers needed to cover both markets properly" },
    { value: "~3.4%", label: "Blended fee at the projected volume" },
    { value: "6 weeks", label: "Estimated integration, both providers" },
  ],
  sections: [
    {
      heading: "Key findings",
      items: [
        "US customers pay by card and expect subscriptions, dunning and invoices to simply work. Every global processor reviewed does this well.",
        "UK customers largely pay by bank transfer and e-wallet. The global processors support a small share of these methods, at higher fees.",
        "Local aggregators cover the UK methods at lower cost, but their subscription tooling is limited and their US support is minimal.",
      ],
    },
    {
      heading: "What it costs",
      table: {
        columns: ["Setup", "US cards", "UK methods", "Blended fee", "Integration"],
        rows: [
          ["Global processor only", "Strong", "Partial, costly", "~4.1%", "3 weeks"],
          ["Local aggregator only", "Weak", "Strong", "~3.0%", "4 weeks"],
          ["Global + local, one billing layer", "Strong", "Strong", "~3.4%", "6 weeks"],
        ],
      },
    },
    { heading: "Important risks", tone: "risk", items: ["Two providers means two reconciliation flows; the internal billing layer has to own the source of truth.", "Local licensing rules for payment aggregators change; contract terms should allow switching."] },
    { heading: "Recommendation", tone: "recommendation", body: ["Start with the global processor for US cards and subscriptions now, and add the local aggregator for the UK behind a thin billing layer that both report into."] },
  ],
  sources: [
    { kind: "reference", label: "Expansion brief", detail: "As provided" },
    { kind: "reference", label: "Provider pricing and method coverage", detail: "Six providers" },
    { kind: "reference", label: "Payment method usage, the UK", detail: "Public statistics" },
    { kind: "reference", label: "Provider documentation", detail: "Subscriptions, settlement" },
  ],
};

export const SAMPLE_COMPARE: RunResult = {
  title: "Supplier Comparison",
  summary: "Of the four suppliers, two are realistic choices. Northfield is the cheapest per unit but has the longest and least predictable lead time. Halden costs about 6% more and delivers in half the time with a firm penalty clause.",
  sections: [
    {
      heading: "Side by side",
      table: {
        columns: ["Supplier", "Unit price", "Lead time", "Minimum order", "Terms"],
        rows: [
          ["Northfield", "Lowest", "6–8 weeks", "5,000", "50% upfront"],
          ["Halden", "+6%", "3–4 weeks", "2,000", "Net 30, late penalty"],
          ["Corvane", "+14%", "4 weeks", "1,000", "Net 30"],
          ["Ostrow & Pike", "+9%", "5–9 weeks", "5,000", "Full prepayment"],
        ],
      },
    },
    { heading: "Key findings", items: ["Northfield's quote excludes freight; once added, the gap to Halden narrows to about 3%.", "Halden is the only supplier offering a contractual late-delivery penalty."] },
    { heading: "Important risks", tone: "risk", items: ["Northfield's lead time depends on a single production line.", "None of the quotes fix prices beyond 60 days."] },
    { heading: "Recommendation", tone: "recommendation", body: ["Place the first order with Halden and ask Northfield for a freight-inclusive quote to keep as a second source. Request a 90-day price hold from both before signing."] },
  ],
  sources: [],
};

export const SAMPLE_CODE: RunResult = {
  title: "Authentication Flow Overview",
  summary: "The repository uses session-based authentication with short-lived access tokens and a rotating refresh token in an HTTP-only cookie.",
  sections: [
    { heading: "How sign-in works", ordered: true, items: ["The login form posts credentials to the session endpoint.", "The server verifies the password hash and creates a session record.", "It returns an access token and sets a refresh token cookie."] },
    {
      heading: "Where it lives",
      table: {
        columns: ["File", "Responsibility"],
        rows: [
          ["src/auth/session.ts", "Create, refresh and revoke sessions"],
          ["src/auth/tokens.ts", "Sign and verify access and refresh tokens"],
          ["src/middleware/requireUser.ts", "Guard protected routes"],
          ["src/client/http.ts", "Attach tokens, retry on 401"],
        ],
      },
    },
  ],
  sources: [],
};

export const SAMPLE_SUMMARY: RunResult = {
  title: "Summary and Key Insights",
  summary: "The documents describe a business growing in its core line while carrying more operational complexity than its systems were built for.",
  sections: [
    { heading: "Key insights", items: ["Onboarding takes too long. It appears in the interviews, the support log and the board deck.", "Retention is strong once customers are set up."] },
    { heading: "What the documents say", body: ["The board deck frames growth as the headline; the interview notes describe the first month as the hardest part of the relationship."] },
    { heading: "Where they disagree", tone: "risk", items: ["The deck reports onboarding as two weeks; the interviews consistently describe four to six."] },
    { heading: "Recommendation", tone: "recommendation", body: ["Treat onboarding as the priority for the next quarter. Measure it the way customers experience it, from signature to first real use, and remove the manual steps the team already knows how to standardise."] },
  ],
  sources: [],
};

export const SAMPLE_MARKET: RunResult = {
  title: "Market Research Report",
  summary: "The mid-tier market for refurbished espresso machines in Northern Europe is growing, driven by independent cafés upgrading from entry-level equipment. Demand is real but concentrated: three cities account for most of the volume. The clearest opening is a service-led offer in that tier.",
  highlights: [
    { value: "+18%", label: "Segment growth, Q3 year on year" },
    { value: "3 cities", label: "Account for 64% of unit volume" },
    { value: "41%", label: "Of buyers name servicing as the deciding factor" },
  ],
  sections: [{ heading: "Key findings", items: ["Independent cafés are the growth engine.", "Buyers pay for uptime, not for the machine."] }],
  sources: [],
};

export const SAMPLE_FINANCIAL: RunResult = {
  title: "Financial Report Analysis",
  summary: "Across the three quarterly reports, revenue grew steadily while margin slipped.",
  sections: [
    { heading: "What changed", items: ["Subscription revenue grew in every quarter.", "Fulfilment costs grew roughly twice as fast as revenue."] },
    { heading: "Why it changed", body: ["The Q2 report attributes higher fulfilment cost to a carrier change."] },
    {
      heading: "Quarter by quarter",
      table: {
        columns: ["", "Q1", "Q2", "Q3"],
        rows: [
          ["Revenue (indexed)", "100", "106", "111"],
          ["Gross margin", "46.1%", "44.9%", "43.7%"],
          ["Subscription share", "47%", "50%", "53%"],
          ["Receivables (days)", "44", "51", "58"],
        ],
      },
    },
  ],
  sources: [],
};
