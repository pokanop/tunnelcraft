/* Donation targets — build-time configured via Vite env vars.

   Fail-safe: unset vars resolve to nothing, so the app ships dark until the
   owner supplies handles (`VITE_DONATE_*` env vars). Lighting the CTAs up
   later is a rebuild, not a code change. See POK-322 / ADR-2. */

export type DonateTargetId = "github-sponsors" | "kofi" | "opencollective";

export interface DonateTarget {
  id: DonateTargetId;
  label: string;
  url: string;
}

/* `import.meta.env` is `any`-typed by `vite/client`; normalize so the rest of
   the module is statically typed and the fail-safe guard lives in one place. */
function readEnv(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

interface RawTarget {
  id: DonateTargetId;
  label: string;
  url: string | undefined;
}

const RAW: readonly RawTarget[] = [
  {
    id: "github-sponsors",
    label: "GitHub Sponsors",
    url: readEnv(import.meta.env.VITE_DONATE_GITHUB_SPONSORS_URL),
  },
  {
    id: "kofi",
    label: "Ko-fi",
    url: readEnv(import.meta.env.VITE_DONATE_KOFI_URL),
  },
  {
    id: "opencollective",
    label: "Open Collective",
    url: readEnv(import.meta.env.VITE_DONATE_OPENCOLLECTIVE_URL),
  },
];

/** Configured donation targets, in display order. Empty when no env var is set. */
export const donateTargets: readonly DonateTarget[] = RAW.filter(
  (t): t is DonateTarget => t.url !== undefined
);

/** True iff at least one donation target is configured. Use to gate UI. */
export function hasDonationTarget(): boolean {
  return donateTargets.length > 0;
}
