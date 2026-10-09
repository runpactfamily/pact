// A warm, grainy wash that drifts across the hero: burnt orange with soft,
// displaced edges, like pigment on paper. Pure SVG, no assets.

const SHAPE =
  "M1290 -80 C1120 60 1010 300 820 420 C640 535 480 540 330 660 C200 765 120 880 60 980 L1290 980 Z";

export function HeroVisual() {
  return (
    <div className="wash" aria-hidden="true">
      <svg viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" role="presentation">
        <defs>
          <linearGradient id="wash-g" x1="0.85" y1="0.05" x2="0.15" y2="0.95">
            <stop offset="0" stopColor="#F2A27E" />
            <stop offset="0.45" stopColor="#E4572E" />
            <stop offset="1" stopColor="#C9471F" />
          </linearGradient>
          <filter id="wash-soft" x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.0032" numOctaves="3" seed="9" result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="190" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="42" />
          </filter>
          <filter id="wash-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
            <feColorMatrix values="0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0 0.06  1.2 0 0 0 -0.5" />
          </filter>
          <mask id="wash-m">
            <g filter="url(#wash-soft)">
              <path d={SHAPE} fill="#fff" />
            </g>
          </mask>
        </defs>
        <g filter="url(#wash-soft)">
          <path d={SHAPE} fill="url(#wash-g)" />
          <ellipse cx="980" cy="150" rx="260" ry="200" fill="#F4A989" opacity="0.7" />
        </g>
        <rect width="1200" height="900" filter="url(#wash-grain)" mask="url(#wash-m)" opacity="0.55" />
      </svg>
    </div>
  );
}
