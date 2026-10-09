import Link from "next/link";
import { ArrowRight, CheckIcon } from "@/components/Icons";
import { ChainIcon } from "@/components/onchain/ChainIcon";
import { OnchainWash } from "@/components/onchain/OnchainWash";
import { Reveal } from "@/components/Reveal";
import { HOME, ONCHAIN_URL } from "@/content/site";
import type { ChainId } from "@/lib/pact/types";

// The landing page's Pact Onchain section: what it is, the four chains, and a
// result. The preview is not illustrative copy: it is a real run, recorded on
// the date shown, with its figures exactly as the run returned them.

// Kept here as plain values: the icon module is a client module, and this section renders on the server.
const CHAIN_NAMES: Record<ChainId, string> = { robinhood: "Robinhood Chain", base: "Base", bnb: "BNB Chain", solana: "Solana" };
const CHAIN_COLORS: Record<ChainId, string> = { robinhood: "#CCFF00", base: "#0052FF", bnb: "#F0B90B", solana: "#9945FF" };

const CHAINS: { id: ChainId; note: string }[] = [
  { id: "robinhood", note: "Tokens and tokenized stocks" },
  { id: "base", note: "Tokens, DeFi and approvals" },
  { id: "bnb", note: "Tokens, DeFi and approvals" },
  { id: "solana", note: "Tokens, launchpads and wallets" },
];

const RUN = {
  chain: "robinhood" as ChainId,
  date: "8 October 2026",
  task: "What is trending on Robinhood Chain right now, with volume, liquidity and holders for each token, and which tokenized stocks are most traded?",
  title: "Robinhood Chain: trending tokens and most-traded tokenized stocks",
  duration: "1m 21s",
  highlights: [
    { value: "$1.04B", label: "Robinhood Chain DeFi TVL" },
    { value: "$322.75M", label: "24h volume on the WETH/USDG pair, the top trending entry" },
    { value: "$7.77M", label: "CRCL 24h volume, highest of the tokenized stocks and ETFs in the screen" },
  ],
  tableTitle: "Most-traded tokenized stocks and ETFs, 24h",
  columns: ["#", "Token", "Vol 24h", "Liquidity", "Trades", "Holders", "Top 10"],
  rows: [
    ["1", "CRCL", "$7.77M", "$5.25M", "3,064", "12.7K", "44.0%"],
    ["2", "SPY", "$5.84M", "$1.19M", "12,075", "71.1K", "27.3%"],
    ["3", "NVDA", "$5.02M", "$1.59M", "5,930", "186.0K", "26.7%"],
    ["4", "MSTR", "$4.97M", "$1.56M", "3,401", "17.6K", "24.5%"],
    ["5", "GOOGL", "$3.43M", "$568.7K", "5,727", "70.8K", "44.2%"],
    ["6", "SPCX", "$3.04M", "$620.4K", "6,583", "113.3K", "36.2%"],
  ],
  note: "No flags were found by the checks run. That does not mean the tokens are safe.",
};

export function OnchainSection() {
  const copy = HOME.onchain;
  return (
    <section className="section oc" id="onchain" style={{ "--chain": CHAIN_COLORS[RUN.chain] } as React.CSSProperties}>
      <OnchainWash chain={RUN.chain} />
      <div className="container oc__inner">
        <Reveal className="oc__head">
          <p className="label oc__label">
            <span className="oc__marks" aria-hidden="true">
              {CHAINS.map((chain) => (
                <ChainIcon key={chain.id} chain={chain.id} size={18} />
              ))}
            </span>
            {copy.label}
          </p>
          <h2 className="display-2">{copy.headline}</h2>
          <div className="oc__copy">
            {copy.copy.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <div className="oc__actions">
            <a href={ONCHAIN_URL} className="btn btn--lg">
              Open Pact Onchain
              <ArrowRight />
            </a>
            <Link href="/docs?section=onchain" className="textlink" prefetch={false}>
              Read the onchain guide
            </Link>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <ul className="oc__chains">
            {CHAINS.map((chain) => (
              <li key={chain.id}>
                <a href={`${ONCHAIN_URL}/?chain=${chain.id}`} className="oc__chain" style={{ "--chain": CHAIN_COLORS[chain.id] } as React.CSSProperties}>
                  <span className="oc__chainmark">
                    <ChainIcon chain={chain.id} size={26} />
                  </span>
                  <span className="oc__chaintext">
                    <strong>{CHAIN_NAMES[chain.id]}</strong>
                    <span>{chain.note}</span>
                  </span>
                  <ArrowRight className="oc__chaingo" />
                </a>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={140}>
          <figure className="ocp">
            <div className="ocp__chrome">
              <span className="ocp__dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="ocp__url">onchain.runpact.family</span>
              <span className="ocp__real label">Real run · {RUN.date}</span>
            </div>
            <div className="ocp__body">
              <div className="ocp__job">
                <p className="ocp__chip">
                  <ChainIcon chain={RUN.chain} size={16} />
                  {CHAIN_NAMES[RUN.chain]}
                </p>
                <p className="label">The job</p>
                <p className="ocp__task">“{RUN.task}”</p>
                <p className="ocp__status label">
                  <CheckIcon />
                  Done in {RUN.duration}
                </p>
              </div>
              <div className="ocp__result">
                <p className="ocp__title">{RUN.title}</p>
                <dl className="ocp__stats">
                  {RUN.highlights.map((item) => (
                    <div key={item.label}>
                      <dd>{item.value}</dd>
                      <dt>{item.label}</dt>
                    </div>
                  ))}
                </dl>
                <p className="label ocp__tabletitle">{RUN.tableTitle}</p>
                <div className="ocp__tablewrap">
                  <table className="ocp__table">
                    <thead>
                      <tr>
                        {RUN.columns.map((column) => (
                          <th key={column} scope="col">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {RUN.rows.map((row) => (
                        <tr key={row[1]}>
                          {row.map((cell, i) => (i === 1 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="ocp__note">{RUN.note}</p>
              </div>
            </div>
            <figcaption className="ocp__caption">
              A result from a real Pact Onchain run, shortened to its first rows. Figures are a snapshot from {RUN.date}, not live data.
            </figcaption>
          </figure>
        </Reveal>

        <Reveal delay={120}>
          <ul className="oc__caps">
            {copy.capabilities.map((item, i) => (
              <li key={item.title}>
                <span className="label">{String(i + 1).padStart(2, "0")}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
