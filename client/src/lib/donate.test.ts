import { afterEach, describe, expect, it } from "vitest";
import { donateTargets, hasDonationTarget } from "./donate";

/* Pins the donation-config behavior of lib/donate.ts: GitHub Sponsors +
   Ko-fi are baked in as defaults (CTAs appear out-of-the-box), each URL is
   overridable via its VITE_DONATE_* env var, and the feature is fail-safe —
   empty/unset overrides fall back to the baked-in default rather than
   hiding the CTA.

   `donateTargets` is evaluated at module load, so the override cases below
   re-import the module with a cache-busting query (bun:test does not expose
   vitest's vi.resetModules/vi.stubEnv; under bun, import.meta.env mirrors
   process.env, so setting process.env before the dynamic import is enough). */

const KEYS = ["VITE_DONATE_GITHUB_SPONSORS_URL", "VITE_DONATE_KOFI_URL"] as const;

function snapshotEnv(): Record<string, string | undefined> {
  return Object.fromEntries(KEYS.map((k) => [k, process.env[k]])) as Record<
    string,
    string | undefined
  >;
}

function restoreEnv(snap: Record<string, string | undefined>): void {
  for (const k of KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k]!;
  }
}

const initial = snapshotEnv();
afterEach(() => restoreEnv(initial));

/* Monotonic counter guarantees each cache-busting import resolves to a fresh
   module instance (Date.now() alone can collide across tests in the same ms). */
let bustSeq = 0;
const reimport = (): Promise<typeof import("./donate")> => import("./donate?t=" + ++bustSeq);

describe("donate config — defaults", () => {
  it("bakes in GitHub Sponsors + Ko-fi pointing at the pokanop profiles", () => {
    expect(donateTargets).toHaveLength(2);
    expect(donateTargets.map((t) => t.key)).toEqual(["github", "kofi"]);
    const gh = donateTargets.find((t) => t.key === "github");
    const kofi = donateTargets.find((t) => t.key === "kofi");
    expect(gh?.label).toBe("GitHub Sponsors");
    expect(gh?.url).toBe("https://github.com/sponsors/pokanop");
    expect(kofi?.label).toBe("Ko-fi");
    expect(kofi?.url).toBe("https://ko-fi.com/pokanop");
  });

  it("reports a donation target by default (CTAs appear out-of-the-box)", () => {
    expect(hasDonationTarget()).toBe(true);
  });
});

describe("donate config — env overrides", () => {
  it("VITE_DONATE_GITHUB_SPONSORS_URL overrides only the github URL", async () => {
    process.env.VITE_DONATE_GITHUB_SPONSORS_URL = "https://example.com/gh";
    const mod = await reimport();
    const targets = (mod as typeof import("./donate")).donateTargets;
    expect(targets.find((t) => t.key === "github")?.url).toBe("https://example.com/gh");
    // Ko-fi keeps its baked-in default.
    expect(targets.find((t) => t.key === "kofi")?.url).toBe("https://ko-fi.com/pokanop");
  });

  it("VITE_DONATE_KOFI_URL overrides only the kofi URL", async () => {
    process.env.VITE_DONATE_KOFI_URL = "https://example.com/kofi";
    const mod = await reimport();
    const targets = (mod as typeof import("./donate")).donateTargets;
    expect(targets.find((t) => t.key === "kofi")?.url).toBe("https://example.com/kofi");
    // GitHub keeps its baked-in default.
    expect(targets.find((t) => t.key === "github")?.url).toBe(
      "https://github.com/sponsors/pokanop"
    );
  });

  it("empty overrides fall back to the baked-in defaults (fail-safe, never hides)", async () => {
    process.env.VITE_DONATE_GITHUB_SPONSORS_URL = "";
    process.env.VITE_DONATE_KOFI_URL = "";
    const mod = await reimport();
    const targets = (mod as typeof import("./donate")).donateTargets;
    expect(targets.find((t) => t.key === "github")?.url).toBe(
      "https://github.com/sponsors/pokanop"
    );
    expect(targets.find((t) => t.key === "kofi")?.url).toBe("https://ko-fi.com/pokanop");
    expect((mod as typeof import("./donate")).hasDonationTarget()).toBe(true);
  });
});
