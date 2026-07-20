import { Fragment } from "react";
import { donateTargets, hasDonationTarget } from "../lib/donate";

/* Reusable donation surfaces. Plain anchors only — no iframes, no third-party
   scripts, no new runtime deps (ADR-1 / ADR-4). Both exports render `null`
   when no targets are configured, so call sites can mount them unconditionally
   and the UI stays fail-safe (ADR-2). */

const NEW_TAB = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

/** Inline link cluster — used in the footer and the account card. */
export function DonateLinks() {
  if (!hasDonationTarget()) return null;
  return (
    <span className="donate-row" aria-label="Support TunnelCraft">
      <span className="donate-row-label">SUPPORT</span>
      {donateTargets.map((t, i) => (
        <Fragment key={t.id}>
          {i > 0 && (
            <span className="donate-sep" aria-hidden="true">
              ·
            </span>
          )}
          <a className="donate-link" href={t.url} {...NEW_TAB}>
            {t.label}
          </a>
        </Fragment>
      ))}
    </span>
  );
}

/** Button-style CTA — used in the landing final-CTA section. */
export function DonateCTA() {
  if (!hasDonationTarget()) return null;
  return (
    <div className="donate-cta" aria-label="Support TunnelCraft">
      <div className="donate-cta-btns">
        {donateTargets.map((t) => (
          <a key={t.id} className="btn ghost" href={t.url} {...NEW_TAB}>
            {"SPONSOR · " + t.label.toUpperCase()}
          </a>
        ))}
      </div>
    </div>
  );
}
