export function MVerifyMark({ size = 42 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 42 42" fill="none" aria-label="M-Verify">
      <rect width="42" height="42" rx="9" fill="url(#mobile-mark-bg)" />
      <path d="M10 32V10l11 12 11-12v22" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="3.2" fill="#82F16F" />
      <circle cx="32" cy="10" r="3.2" fill="#82F16F" />
      <circle cx="21" cy="22" r="4.2" fill="#55FF3C" />
      <path d="m25.7 27.6 3 3.2 6-7" stroke="#55FF3C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="mobile-mark-bg" x1="0" y1="0" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0C2A11" />
          <stop offset="0.52" stopColor="#168B3D" />
          <stop offset="1" stopColor="#050705" />
        </linearGradient>
      </defs>
    </svg>
  );
}
