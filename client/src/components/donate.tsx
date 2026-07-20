/* Donation CTAs — external links to GitHub Sponsors + Ko-fi.

   Composed from existing button/link tokens; additive only (never gates
   content). Links open in a new tab with rel safety, mirroring the OAuth
   provider buttons in auth.tsx. Two variants share one source of truth in
   lib/donate.ts:
     - "links"   compact inline cluster (footer)
     - "buttons" button row, primary first then ghost (account, landing) */
import { donateTargets } from "../lib/donate";

type Variant = "links" | "buttons";

export function Donate({ variant = "links" }: { variant?: Variant }) {
  if (donateTargets.length === 0) return null;

  if (variant === "buttons") {
    return (
      <div className="donate-row">
        {donateTargets.map((t, i) => (
          <a
            key={t.key}
            className={"btn" + (i === 0 ? "" : " ghost")}
            href={t.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={"Support tunnelcraft on " + t.label}
          >
            {"SUPPORT ON " + t.label.toUpperCase() + " →"}
          </a>
        ))}
      </div>
    );
  }

  return (
    <span className="donate-links">
      <span className="donate-label">SUPPORT</span>
      {donateTargets.map((t) => (
        <a
          key={t.key}
          className="donate-link"
          href={t.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.label}
        </a>
      ))}
    </span>
  );
}
