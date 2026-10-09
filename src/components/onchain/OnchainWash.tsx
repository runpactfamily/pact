"use client";

import type { ChainId } from "@/lib/pact/types";
import { CHAIN_COLORS } from "./ChainIcon";

// The landing page's wash, in the colours of the four chains: the same
// displaced, blurred pigment on paper, with the selected chain glowing
// strongest. Pure SVG, no assets.

const SHAPE =
  "M1290 -80 C1120 60 1010 300 820 420 C640 535 480 540 330 660 C200 765 120 880 60 980 L1290 980 Z";

export function OnchainWash({ chain }: { chain: ChainId }) {
  return (
    <div className="wash wash--onchain" aria-hidden="true">
      <svg viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" role="presentation">
        <defs>
          <linearGradient id="onchain-wash-g" x1="0.9" y1="0" x2="0.1" y2="1">
            <stop offset="0" stopColor={CHAIN_COLORS.robinhood} />
            <stop offset="0.34" stopColor={CHAIN_COLORS.bnb} />
            <stop offset="0.66" stopColor={CHAIN_COLORS.base} />
            <stop offset="1" stopColor={CHAIN_COLORS.solana} />
          </linearGradient>
          <filter id="onchain-wash-soft" x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.0032" numOctaves="3" seed="9" result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="190" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="46" />
          </filter>
          <filter id="onchain-wash-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
            <feColorMatrix values="0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0 0.06  1.2 0 0 0 -0.5" />
          </filter>
          <mask id="onchain-wash-m">
            <g filter="url(#onchain-wash-soft)">
              <path d={SHAPE} fill="#fff" />
            </g>
          </mask>
        </defs>
        <g filter="url(#onchain-wash-soft)">
          <path d={SHAPE} fill="url(#onchain-wash-g)" />
          <ellipse cx="960" cy="170" rx="300" ry="230" fill={CHAIN_COLORS[chain]} opacity="0.75" />
        </g>
        <rect width="1200" height="900" filter="url(#onchain-wash-grain)" mask="url(#onchain-wash-m)" opacity="0.5" />
      </svg>
    </div>
  );
}
