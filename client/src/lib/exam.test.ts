import { describe, expect, it } from "vitest";
import { buildExam, certCode, examPool, EXAM_LEN } from "./exam";
import { TRACKS } from "../curriculum/tracks";
import { EXAM_BANK } from "../curriculum/exam-bank";

describe("exam engine", () => {
  it("pools module quiz questions plus the bank for every track", () => {
    for (const t of TRACKS) {
      const pool = examPool(t);
      expect(pool.length).toBeGreaterThan(EXAM_LEN);
      const bank = EXAM_BANK[t.id] ?? [];
      expect(bank.length).toBeGreaterThan(0);
      expect(pool.filter((q) => q.key.startsWith("exam:")).length).toBe(bank.length);
      // every module-backed entry carries its module id for review-deck keys
      for (const eq of pool)
        if (!eq.key.startsWith("exam:")) expect(eq.key.startsWith(eq.modId + ":")).toBe(true);
    }
  });

  it("draws a full-length paper with no duplicate questions", () => {
    for (const t of TRACKS) {
      const paper = buildExam(t);
      expect(paper.length).toBe(EXAM_LEN);
      expect(new Set(paper.map((p) => p.key)).size).toBe(EXAM_LEN);
    }
  });

  it("draws differ between sittings (randomized bank)", () => {
    const t = TRACKS[0]!;
    const a = buildExam(t)
      .map((p) => p.key)
      .join("|");
    // 5 fresh draws from a large pool colliding entirely is ~impossible
    const anyDiff = Array.from({ length: 5 }, () =>
      buildExam(t)
        .map((p) => p.key)
        .join("|")
    ).some((b) => b !== a);
    expect(anyDiff).toBe(true);
  });

  it("every pooled question has a well-formed answer key", () => {
    for (const t of TRACKS)
      for (const { q } of examPool(t)) {
        expect(q.opts.length).toBeGreaterThanOrEqual(2);
        expect(Number.isInteger(q.a)).toBe(true);
        expect(q.a).toBeGreaterThanOrEqual(0);
        expect(q.a).toBeLessThan(q.opts.length);
        expect(q.why.length).toBeGreaterThan(0);
      }
  });

  it("certificate serials are deterministic", () => {
    const t = TRACKS[1]!;
    expect(certCode(t, 92, "2026-07-01")).toBe("TC-RUST-20260701-92");
  });
});
