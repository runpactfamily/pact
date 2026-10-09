"use client";

import { useId } from "react";
import type { ChainId } from "@/lib/pact/types";

// Marks for the four chains. Drawn here rather than loaded from the brands,
// so they render instantly, scale cleanly and never break when a CDN does.

export const CHAIN_COLORS: Record<ChainId, string> = {
  robinhood: "#CCFF00",
  base: "#0052FF",
  bnb: "#F0B90B",
  solana: "#9945FF",
};

/** The chain colour as type on cream paper: lime needs a darker shade to stay readable. */
export const CHAIN_TEXT: Record<ChainId, string> = {
  robinhood: "#6f9400",
  base: "#0052FF",
  bnb: "#c9960a",
  solana: "#9945FF",
};

/** Robinhood's feather, traced from the brand's 400×400 mark. */
const ROBINHOOD_FEATHER = "M 241.539 80.112 C 225.635 82.429, 220.761 85.528, 198.871 107.244 L 184.500 121.500 214.647 122 C 242.489 122.462, 244.955 122.646, 246.897 124.405 C 248.954 126.269, 249 127.036, 249 159.655 C 249 185.693, 249.274 192.988, 250.250 192.945 C 251.991 192.869, 286.990 146.869, 289.764 141.012 C 295.521 128.853, 294.684 102.530, 288.153 90.420 C 286.174 86.749, 284.357 84.935, 281 83.274 C 273.200 79.415, 255.861 78.026, 241.539 80.112 M 171.344 137.250 C 165.827 143.131, 135.163 181.785, 133.568 184.868 C 130.993 189.847, 130.041 200.300, 130.020 223.797 L 130 246.094 120.058 275.797 C 109.384 307.688, 105.859 319.525, 106.763 320.430 C 107.838 321.504, 113.755 321.001, 114.750 319.750 C 115.297 319.063, 118.326 312.200, 121.481 304.500 C 145.772 245.207, 178.485 191.309, 216.750 147.534 C 222.387 141.085, 227 135.401, 227 134.904 C 227 134.388, 215.707 134, 200.696 134 L 174.392 134 171.344 137.250 M 226.973 155.732 C 201.721 185.421, 179.432 218.245, 159.141 255.619 C 150.660 271.241, 149.818 273.480, 152.750 272.623 C 175.694 265.917, 208.083 255.365, 210.072 253.948 C 211.515 252.921, 218.389 242.672, 225.348 231.173 L 238 210.266 238 178.192 C 238 159.392, 237.613 145.879, 237.066 145.541 C 236.552 145.223, 232.010 149.809, 226.973 155.732";

export const CHAIN_NAMES: Record<ChainId, string> = {
  robinhood: "Robinhood Chain",
  base: "Base",
  bnb: "BNB Chain",
  solana: "Solana",
};

export function ChainIcon({ chain, size = 22 }: { chain: ChainId; size?: number }) {
  // Gradient ids must be unique per instance: a hidden copy (the sidebar on mobile) would otherwise own the only definition.
  const gradient = `sol-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const common = { width: size, height: size, viewBox: "0 0 32 32", "aria-hidden": true as const };
  switch (chain) {
    case "base":
      return (
        <svg {...common}>
          <circle cx="16" cy="16" r="14" fill="#0052FF" />
          <path d="M16 6.5a9.5 9.5 0 1 1-9.4 10.6H18v-2.3H6.6A9.5 9.5 0 0 1 16 6.5Z" fill="#fff" />
        </svg>
      );
    case "bnb":
      return (
        <svg {...common}>
          <circle cx="16" cy="16" r="14" fill="#F0B90B" />
          <g fill="#fff">
            <path d="m16 8.4 3.1 3.1-3.1 3.1-3.1-3.1z" />
            <path d="m10.6 13.8 3.1 3.1-3.1 3.1-3.1-3.1z" />
            <path d="m21.4 13.8 3.1 3.1-3.1 3.1-3.1-3.1z" />
            <path d="m16 19.2 3.1 3.1-3.1 3.1-3.1-3.1z" />
            <path d="m16 13.8 3.1 3.1-3.1 3.1-3.1-3.1z" />
          </g>
        </svg>
      );
    case "solana":
      return (
        <svg {...common}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#9945FF" />
              <stop offset="1" stopColor="#14F195" />
            </linearGradient>
          </defs>
          <circle cx="16" cy="16" r="14" fill="#101012" />
          <g fill={`url(#${gradient})`}>
            <path d="M10.2 9.5h12.6l-2.6 2.8H7.6z" />
            <path d="M10.2 14.6h12.6l-2.6 2.8H7.6z" transform="translate(1.6)" />
            <path d="M10.2 19.7h12.6l-2.6 2.8H7.6z" />
          </g>
        </svg>
      );
    case "robinhood":
      // The brand mark, traced from the official lime square: black feather on #CCFF00.
      return (
        <svg {...common}>
          <rect x="0" y="0" width="32" height="32" rx="7" fill="#CCFF00" />
          <g transform="scale(0.08)">
            <path d={ROBINHOOD_FEATHER} fill="#000" fillRule="evenodd" />
          </g>
        </svg>
      );
  }
}
