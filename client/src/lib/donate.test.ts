import { describe, expect, it } from "vitest";
import { donateTargets, hasDonationTarget } from "./donate";

/* POK-322 / ADR-2: with no `VITE_DONATE_*` env vars set (the test runner and
   the "ships dark" build both leave them unset), the donate surface must be
   completely inert. This test pins that fail-safe default so a future change
   can't accidentally light CTAs up. Per-target rendering when a single env
   var is set is exercised via a runtime build, not here. */
describe("donate lib (fail-safe default)", () => {
  it("hasDonationTarget() is false when no env vars are set", () => {
    expect(hasDonationTarget()).toBe(false);
  });

  it("donateTargets is empty when no env vars are set", () => {
    expect(donateTargets).toEqual([]);
  });
});
