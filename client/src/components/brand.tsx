/* Brand mark: a tunnel portal with packets moving through it.
   Theme-aware (inherits CSS variables); the favicon in /public
   mirrors this geometry with fixed colors. */

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="logo"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      {/* portal */}
      <rect x="2" y="2" width="28" height="28" rx="8" stroke="var(--ink)" strokeWidth="2.5" />
      {/* packets entering the tunnel */}
      <path
        d="M8 10.5 L13.5 16 L8 21.5"
        stroke="var(--acc)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.45"
      />
      <path
        d="M14 10.5 L19.5 16 L14 21.5"
        stroke="var(--acc)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.75"
      />
      <path
        d="M20 10.5 L25.5 16 L20 21.5"
        stroke="var(--acc)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ tagline = true }: { tagline?: boolean }) {
  return (
    <span className="wordmark">
      TUNNEL<span className="tx">CRAFT</span>
      {tagline && <small>NETWORKING · RUST · VPN ENGINEERING</small>}
    </span>
  );
}
