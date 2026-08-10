import { describe, expect, it } from "vitest";
import { authFragmentDestination, resetTokenFromHash } from "./auth-links";

describe("password-reset email links", () => {
  const sampleHash = "#reset=i2ksEZsMCx7MWFCGeJmveDzxEIKxgzoSVynh29LXRfU";

  it("routes the legacy email URL fragment to the dedicated password-reset page", () => {
    expect(authFragmentDestination(sampleHash)).toBe("/reset-password");
    expect(resetTokenFromHash(sampleHash)).toBe("i2ksEZsMCx7MWFCGeJmveDzxEIKxgzoSVynh29LXRfU");
  });

  it("keeps OAuth errors on the sign-in page", () => {
    expect(authFragmentDestination("#oauth_error=github_link_failed")).toBe("/auth");
  });

  it("ignores unrelated and malformed fragments", () => {
    expect(authFragmentDestination("#main")).toBeNull();
    expect(resetTokenFromHash("#reset=")).toBeNull();
    expect(resetTokenFromHash("#reset=not+a+base64url+token")).toBeNull();
  });
});
