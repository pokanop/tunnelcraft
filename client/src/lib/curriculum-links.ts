/* Module-code and RFC link helpers for curriculum inline markup. */
import { ALL_MODULES } from "../curriculum/tracks";

/** Map display codes (N01, T03, …) to module ids for internal links. */
export const MOD_CODE_TO_ID: Readonly<Record<string, string>> = Object.fromEntries(
  ALL_MODULES.map((m) => [m.code, m.id])
);

/** Canonical RFC Editor URL for a numeric RFC. */
export function rfcUrl(num: number): string {
  return `https://www.rfc-editor.org/rfc/rfc${num}.html`;
}

/** Internal module page path; optional tab is a lesson or lab id. */
export function modPath(id: string, tab?: string): string {
  return tab ? `/m/${id}/${tab}` : `/m/${id}`;
}

/** Match module cross-refs like N01, T03, R07, P01, S02 (optional trailing 's). */
export const MOD_CODE_RE = /\b([NTRPS])(\d{2})(?:'s)?\b/g;

/** Match RFC numbers, including slash-separated pairs like 5389/8489. */
export const RFC_RE = /\bRFC\s+(\d{2,5})(?:\/(\d{2,5}))?\b/g;
