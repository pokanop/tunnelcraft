/* Donation/support targets for tunnelcraft.

   URLs are public, stable values surfaced as plain external links (never
   secrets). The pokanop profiles below are baked in as defaults so the CTAs
   appear out-of-the-box; set VITE_DONATE_GITHUB_SPONSORS_URL /
   VITE_DONATE_KOFI_URL at build time to override per deployment. Empty
   overrides fall back to the default, so the feature is always fail-safe. */

export interface DonateTarget {
  key: "github" | "kofi";
  label: string;
  url: string;
}

const env = import.meta.env as unknown as Record<string, string | undefined>;

const githubSponsorsUrl =
  env.VITE_DONATE_GITHUB_SPONSORS_URL || "https://github.com/sponsors/pokanop";

const kofiUrl = env.VITE_DONATE_KOFI_URL || "https://ko-fi.com/pokanop";

export const donateTargets: DonateTarget[] = [
  { key: "github", label: "GitHub Sponsors", url: githubSponsorsUrl },
  { key: "kofi", label: "Ko-fi", url: kofiUrl },
];

export function hasDonationTarget(): boolean {
  return donateTargets.length > 0;
}
