/**
 * M-Verify brand logo — dynamic, techy, transactional.
 *
 * Design language:
 *  • The "M" is rendered as a node-graph: 5 network nodes connected
 *    by strokes, with a bright green data-dot that continuously
 *    flows along the full M path (like a live transaction trace).
 *  • The centre valley node pulses — it's the "verification point".
 *  • A shimmer sweep crosses the pill every few seconds (scan effect).
 *  • The right badge pulses outward with two staggered rings
 *    (radar / real-time signal).
 *  • "VERIFY" is set in monospace for a terminal/code aesthetic.
 *  • Three stacked TX arrows on the far right reinforce money flow.
 *  • An optional grid pattern gives a circuit-board depth.
 */

/* ── Full horizontal lockup ──────────────────────────────────────────────── */
export function MVerifyLogo({ height = 44 }: { height?: number }) {
  const VW = 196, VH = 44;
  const w = Math.round(VW * (height / VH));

  return (
    <svg
      width={w}
      height={height}
      viewBox={`0 0 ${VW} ${VH}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="M-Verify"
    >
      <defs>
        {/* ── Background gradient ── */}
        <linearGradient id="mv-bg" x1="0" y1="0" x2={VW} y2={VH} gradientUnits="userSpaceOnUse">
          <stop stopColor="#00B35A" />
          <stop offset="0.5" stopColor="#007A3D" />
          <stop offset="1" stopColor="#003D1F" />
        </linearGradient>

        {/* ── Shimmer sweep ── */}
        <linearGradient id="mv-shine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="white" stopOpacity="0" />
          <stop offset="42%"  stopColor="white" stopOpacity="0" />
          <stop offset="50%"  stopColor="white" stopOpacity="0.18" />
          <stop offset="58%"  stopColor="white" stopOpacity="0" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            from="-2 0" to="2 0"
            dur="3.2s"
            repeatCount="indefinite"
            additive="sum"
          />
        </linearGradient>

        {/* ── Circuit grid pattern ── */}
        <pattern id="mv-grid" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M 8 0 H 0 V 8" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" fill="none" />
        </pattern>

        {/* ── Pill clip ── */}
        <clipPath id="mv-clip">
          <rect width={VW} height={VH} rx="9" />
        </clipPath>

        {/* ── M node path for animateMotion ── */}
        {/* Traces: BL → TL → CV → TR → BR */}
        <path id="mv-mp" d="M 10 34 L 10 9 L 21.5 22 L 33 9 L 33 34" />
      </defs>

      {/* ──────────── PILL BODY ──────────── */}
      <rect width={VW} height={VH} rx="9" fill="url(#mv-bg)" />

      {/* Grid overlay */}
      <g clipPath="url(#mv-clip)">
        <rect width={VW} height={VH} fill="url(#mv-grid)" />
      </g>

      {/* Shimmer */}
      <rect width={VW} height={VH} rx="9" fill="url(#mv-shine)" />

      {/* Top-edge glass highlight */}
      <rect x="1" y="1" width={VW - 2} height="1" rx="0.5" fill="rgba(255,255,255,0.18)" />

      {/* ──────────── M  (node graph) ──────────── */}

      {/* Stroke lines first, behind nodes */}
      <line x1="10"   y1="9"  x2="10"   y2="34" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
      <line x1="10"   y1="9"  x2="21.5" y2="22" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
      <line x1="21.5" y1="22" x2="33"   y2="9"  stroke="white" strokeWidth="2.6" strokeLinecap="round" />
      <line x1="33"   y1="9"  x2="33"   y2="34" stroke="white" strokeWidth="2.6" strokeLinecap="round" />

      {/* Nodes: top-left & top-right */}
      <circle cx="10"   cy="9"  r="3"   fill="#5BE89A" />
      <circle cx="33"   cy="9"  r="3"   fill="#5BE89A" />

      {/* Centre valley node — the "verification point" — pulses */}
      <circle cx="21.5" cy="22" r="4" fill="#5BE89A">
        <animate attributeName="r"       values="4;5.5;4"     dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0.7;1"     dur="1.8s" repeatCount="indefinite" />
      </circle>
      {/* Inner solid dot stays stable */}
      <circle cx="21.5" cy="22" r="2.2" fill="#CCFFE0" />

      {/* Bottom nodes — dimmed, structural */}
      <circle cx="10"   cy="34" r="1.8" fill="rgba(255,255,255,0.35)" />
      <circle cx="33"   cy="34" r="1.8" fill="rgba(255,255,255,0.35)" />

      {/* Animated data-dot flowing along the M path */}
      <circle r="2.8" fill="#FFFFFF" opacity="0.9">
        <animateMotion dur="2.6s" repeatCount="indefinite" calcMode="linear">
          <mpath href="#mv-mp" />
        </animateMotion>
      </circle>
      {/* Glow trail dot (slightly behind, larger, faded) */}
      <circle r="4.5" fill="#5BE89A" opacity="0">
        <animateMotion dur="2.6s" repeatCount="indefinite" calcMode="linear" begin="-0.08s">
          <mpath href="#mv-mp" />
        </animateMotion>
        <animate attributeName="opacity" values="0.35;0.35" dur="2.6s" repeatCount="indefinite" />
      </circle>

      {/* ──────────── SEPARATOR (circuit style) ──────────── */}
      <rect x="42" y="11" width="1" height="22" rx="0.5" fill="rgba(255,255,255,0.22)" />
      {/* Horizontal nubs like PCB traces */}
      <rect x="39" y="17" width="3" height="1" rx="0.5" fill="rgba(255,255,255,0.4)" />
      <rect x="39" y="26" width="3" height="1" rx="0.5" fill="rgba(255,255,255,0.4)" />

      {/* ──────────── VERIFY (monospace) ──────────── */}
      <text
        x="50"
        y="28.5"
        fontFamily="'Courier New', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace"
        fontWeight="700"
        fontSize="15"
        letterSpacing="3.5"
        fill="white"
      >
        VERIFY
      </text>

      {/* Blinking cursor after text */}
      <rect x="140" y="15" width="2" height="14" rx="1" fill="#5BE89A" opacity="0.8">
        <animate attributeName="opacity" values="0.8;0;0.8" dur="1.1s" repeatCount="indefinite" />
      </rect>

      {/* ──────────── LIVE BADGE (pulsing radar) ──────────── */}

      {/* Pulse ring 1 */}
      <circle cx="168" cy="22" r="11" fill="none" stroke="#5BE89A" strokeWidth="1" opacity="0">
        <animate attributeName="r"       values="11;18;18"  dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0;0"   dur="2.4s" repeatCount="indefinite" />
      </circle>
      {/* Pulse ring 2 (staggered) */}
      <circle cx="168" cy="22" r="11" fill="none" stroke="#5BE89A" strokeWidth="0.8" opacity="0">
        <animate attributeName="r"       values="11;18;18"  dur="2.4s" begin="0.85s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.55;0;0"  dur="2.4s" begin="0.85s" repeatCount="indefinite" />
      </circle>

      {/* Badge background */}
      <circle cx="168" cy="22" r="11"
        fill="rgba(255,255,255,0.12)"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="1.2"
      />
      {/* Checkmark */}
      <path
        d="M 162.5 22 L 166.5 25.5 L 174 17"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* ──────────── TX ARROWS (transaction flow indicators) ──────────── */}
      <g opacity="0.55">
        {/* Arrow row 1 */}
        <line x1="183" y1="15" x2="188" y2="15" stroke="#5BE89A" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M 186 13 L 188 15 L 186 17" stroke="#5BE89A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* Arrow row 2 — animated fade */}
        <line x1="183" y1="22" x2="188" y2="22" stroke="#5BE89A" strokeWidth="1.2" strokeLinecap="round">
          <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
        </line>
        <path d="M 186 20 L 188 22 L 186 24" stroke="#5BE89A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
        </path>
        {/* Arrow row 3 */}
        <line x1="183" y1="29" x2="188" y2="29" stroke="#5BE89A" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M 186 27 L 188 29 L 186 31" stroke="#5BE89A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

/* ── Compact square icon ─────────────────────────────────────────────────── */
export function MVerifyIcon({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="M-Verify"
    >
      <defs>
        <linearGradient id="ic-bg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00B35A" />
          <stop offset="1" stopColor="#003D1F" />
        </linearGradient>
        <pattern id="ic-grid" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M 6 0 H 0 V 6" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" fill="none" />
        </pattern>
        <clipPath id="ic-clip">
          <rect width="36" height="36" rx="8" />
        </clipPath>
        {/* M path for data dot */}
        <path id="ic-mp" d="M 7 29 L 7 7 L 18 18 L 29 7 L 29 29" />
      </defs>

      {/* Background */}
      <rect width="36" height="36" rx="8" fill="url(#ic-bg)" />
      <g clipPath="url(#ic-clip)">
        <rect width="36" height="36" fill="url(#ic-grid)" />
      </g>
      {/* Top highlight */}
      <rect x="1" y="1" width="34" height="1" rx="0.5" fill="rgba(255,255,255,0.2)" />

      {/* M strokes */}
      <line x1="7"  y1="7"  x2="7"  y2="29" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="7"  y1="7"  x2="18" y2="18" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="18" y1="18" x2="29" y2="7"  stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="29" y1="7"  x2="29" y2="29" stroke="white" strokeWidth="2.4" strokeLinecap="round" />

      {/* Nodes */}
      <circle cx="7"  cy="7"  r="2.5" fill="#5BE89A" />
      <circle cx="29" cy="7"  r="2.5" fill="#5BE89A" />
      <circle cx="18" cy="18" r="3.2" fill="#5BE89A">
        <animate attributeName="r" values="3.2;4.4;3.2" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="18" cy="18" r="1.6" fill="#CCFFE0" />
      <circle cx="7"  cy="29" r="1.5" fill="rgba(255,255,255,0.3)" />
      <circle cx="29" cy="29" r="1.5" fill="rgba(255,255,255,0.3)" />

      {/* Data dot */}
      <circle r="2.2" fill="white" opacity="0.9">
        <animateMotion dur="2.4s" repeatCount="indefinite" calcMode="linear">
          <mpath href="#ic-mp" />
        </animateMotion>
      </circle>

      {/* Live indicator dot — top-right corner */}
      <circle cx="30" cy="6" r="4" fill="#003D1F" />
      <circle cx="30" cy="6" r="3.5" fill="#003D1F">
        <animate attributeName="r"       values="3.5;6;3.5" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0;1"     dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="30" cy="6" r="2.5" fill="#5BE89A" />
    </svg>
  );
}
