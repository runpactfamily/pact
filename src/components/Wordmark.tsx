import { useId } from "react";
import { cx } from "@/lib/cx";

// The Pact mark: one ribbon folded into a P, in the site's three oranges
// (#F2A27E light, #E4572E accent, #C9471F deep). `src/app/icon.svg` is the same drawing.

const BAR = "M0 106C0 93 5 83 13 75L64 22C71 15 80 11 90 11H177A22 22 0 0 1 199 33V72A58 58 0 0 1 141 130H0Z";
const STEM = "M0 108A34 34 0 0 1 34 74H90V135A56 56 0 0 1 34 191H0Z";

export function PactMark({ className }: { className?: string }) {
  // Ids must be unique per instance: a hidden copy (the sidebar on mobile) would otherwise own the only definitions.
  const id = `pm${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className={className} viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}b`} gradientUnits="userSpaceOnUse" x1="14" y1="122" x2="190" y2="16">
          <stop offset="0" stopColor="#F2A27E" />
          <stop offset="0.5" stopColor="#EA7A50" />
          <stop offset="1" stopColor="#E4572E" />
        </linearGradient>
        <linearGradient id={`${id}u`} gradientUnits="userSpaceOnUse" x1="0" y1="72" x2="0" y2="132">
          <stop offset="0" stopColor="#C9471F" stopOpacity="0" />
          <stop offset="0.14" stopColor="#C9471F" stopOpacity="0.9" />
          <stop offset="1" stopColor="#C9471F" />
        </linearGradient>
        <linearGradient id={`${id}x`} gradientUnits="userSpaceOnUse" x1="90" y1="0" x2="199" y2="0">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id={`${id}s`} gradientUnits="userSpaceOnUse" x1="52" y1="74" x2="36" y2="192">
          <stop offset="0" stopColor="#E4572E" />
          <stop offset="0.45" stopColor="#EC8358" />
          <stop offset="1" stopColor="#F2A27E" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <path d={BAR} />
        </clipPath>
        <mask id={`${id}m`}>
          <rect width="200" height="200" fill={`url(#${id}x)`} />
        </mask>
      </defs>
      {/* The ribbon's upper run, folding down from the top right. */}
      <path d={BAR} fill={`url(#${id}b)`} />
      {/* Its underside, in the deep orange, where it turns back toward the stem. */}
      <g clipPath={`url(#${id}c)`}>
        <rect x="0" y="66" width="200" height="70" fill={`url(#${id}u)`} mask={`url(#${id}m)`} />
      </g>
      {/* The stem, in front. */}
      <path d={STEM} fill={`url(#${id}s)`} />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("wordmark", className)}>
      <PactMark className="wordmark__mark" />
      Pact
    </span>
  );
}
