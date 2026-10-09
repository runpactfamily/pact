"use client";

import { useId } from "react";
import { cx } from "@/lib/cx";
import type { ChainCapabilities, ChainId } from "@/lib/pact/types";
import { CHAIN_IDS } from "@/lib/pact/types";
import { CHAIN_COLORS, CHAIN_NAMES, ChainIcon } from "./ChainIcon";

interface ChainSelectProps {
  /** Live capabilities from the server; null while loading. */
  chains: ChainCapabilities[] | null;
  value: ChainId;
  onChange: (value: ChainId) => void;
  disabled?: boolean;
}

function coverage(entry?: ChainCapabilities): { tone: "full" | "partial" | "loading"; text: string; detail: string } {
  if (!entry) return { tone: "loading", text: "checking", detail: "Checking data coverage" };
  if (entry.market && entry.explorer && entry.security) return { tone: "full", text: "full coverage", detail: "Market, history and security data available" };
  const missing = [!entry.market ? "market" : "", !entry.explorer ? "history" : "", !entry.security ? "security" : ""].filter(Boolean);
  return { tone: "partial", text: "partial coverage", detail: `No ${missing.join(" or ")} data yet. ${entry.notes.join(" ")}` };
}

/** Four chain cards with their marks; one is active. Keyboard: arrow keys move, like radio buttons. */
export function ChainSelect({ chains, value, onChange, disabled }: ChainSelectProps) {
  const id = useId();
  const order = [...CHAIN_IDS];

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = order[(index + delta + order.length) % order.length];
    onChange(next);
    (event.currentTarget.parentElement?.querySelector(`[data-chain="${next}"]`) as HTMLButtonElement | null)?.focus();
  }

  return (
    <div className="chains" role="radiogroup" aria-labelledby={`${id}-label`}>
      <span className="sr-only" id={`${id}-label`}>
        Chain
      </span>
      {order.map((chainId, index) => {
        const entry = chains?.find((c) => c.id === chainId);
        const active = chainId === value;
        const status = coverage(entry);
        return (
          <button
            key={chainId}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-chain={chainId}
            className={cx("chain", active && "is-active")}
            style={{ "--chain": CHAIN_COLORS[chainId] } as React.CSSProperties}
            disabled={disabled}
            title={status.detail}
            onClick={() => onChange(chainId)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className="chain__mark">
              <ChainIcon chain={chainId} size={26} />
            </span>
            <span className="chain__text">
              <span className="chain__name">{entry?.name ?? CHAIN_NAMES[chainId]}</span>
              <span className={cx("chain__status", `is-${status.tone}`)}>{status.text}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The selected chain as a compact chip, for the composer bar. */
export function ChainChip({ chain }: { chain: ChainId }) {
  return (
    <span className="chainchip" style={{ "--chain": CHAIN_COLORS[chain] } as React.CSSProperties} title={`Default chain: ${CHAIN_NAMES[chain]}`}>
      <ChainIcon chain={chain} size={16} />
      {CHAIN_NAMES[chain]}
    </span>
  );
}
