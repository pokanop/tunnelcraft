import { describe, it, expect } from "vitest";
import { search, INDEX_SIZE } from "./search.js";

describe("search index", () => {
  it("builds a non-empty index from the curriculum", () => {
    expect(INDEX_SIZE).toBeGreaterThan(100); // 118 lessons + labs + quizzes
  });
});

describe("search()", () => {
  it("returns [] for empty or too-short queries", () => {
    expect(search("")).toEqual([]);
    expect(search("a")).toEqual([]);
    expect(search("   ")).toEqual([]);
  });

  it("finds core curriculum topics", () => {
    for (const q of ["subnet", "tcp", "wireguard", "ownership"]) {
      expect(search(q).length, `query: ${q}`).toBeGreaterThan(0);
    }
  });

  it("ranks title matches above body-only matches", () => {
    const results = search("subnetting");
    expect(results.length).toBeGreaterThan(1);
    const first = results[0];
    expect(first.lcTitle.includes("subnet") || first.lcMod.includes("subnet")).toBe(true);
    // scores are non-increasing
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it("AND-matches multiple terms", () => {
    const both = search("tcp congestion");
    expect(both.length).toBeGreaterThan(0);
    for (const r of both) {
      const hay = (r.lcTitle + " " + r.lcMod + " " + r.lcText).toLowerCase();
      expect(hay).toContain("tcp");
      expect(hay).toContain("congestion");
    }
  });

  it("returns jumpable results with snippet and target", () => {
    const [r] = search("subnet");
    // plain typeof checks: expect.any(String) in toMatchObject trips a bun:test
    // matcher-state bug (fails the *next* numeric matcher in the same test)
    expect(typeof r.modId).toBe("string");
    expect(typeof r.tab).toBe("string");
    expect(typeof r.title).toBe("string");
    expect(typeof r.snippet).toBe("string");
    expect(r.snippet.length).toBeGreaterThan(0);
  });

  it("respects the limit", () => {
    expect(search("the", 5).length).toBeLessThanOrEqual(5);
  });

  it("finds nothing for gibberish", () => {
    expect(search("xqzzyplugh")).toEqual([]);
  });
});
