// The landing page's wash, brought into the app: the same burnt orange,
// displaced and blurred like pigment on paper, in a shape of its own. Where the
// hero's sweeps diagonally across the page, this one hangs down the right edge
// and curls back in under the composer. Pure SVG, no assets.

const SHAPE =
  "M560 -90 C700 30 880 20 1000 150 C1120 280 1090 430 1010 540 C940 640 800 650 720 760 C680 820 690 900 720 990 L1290 990 L1290 -90 Z";

export function AppWash() {
  return (
    <div className="wash--app" aria-hidden="true">
      <svg viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" role="presentation">
        <defs>
          <linearGradient id="appwash-g" x1="0.7" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#F2A27E" />
            <stop offset="0.5" stopColor="#E4572E" />
            <stop offset="1" stopColor="#C9471F" />
          </linearGradient>
          <filter id="appwash-soft" x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.0036" numOctaves="3" seed="23" result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="170" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="44" />
          </filter>
          <filter id="appwash-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
            <feColorMatrix values="0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0 0.06  1.2 0 0 0 -0.5" />
          </filter>
          <mask id="appwash-m">
            <g filter="url(#appwash-soft)">
              <path d={SHAPE} fill="#fff" />
            </g>
          </mask>
        </defs>
        <g filter="url(#appwash-soft)">
          <path d={SHAPE} fill="url(#appwash-g)" />
          <ellipse cx="1090" cy="120" rx="230" ry="190" fill="#F4A989" opacity="0.6" />
        </g>
        <rect width="1200" height="900" filter="url(#appwash-grain)" mask="url(#appwash-m)" opacity="0.55" />
      </svg>
    </div>
  );
}
