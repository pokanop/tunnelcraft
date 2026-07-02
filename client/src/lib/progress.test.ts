import { describe, expect, it } from "vitest";
import { emptyProgress, localDay, touchActivity } from "./progress";

const at = (iso: string) => new Date(iso + "T10:00:00");

describe("localDay", () => {
  it("formats the local calendar day", () => {
    expect(localDay(at("2026-07-01"))).toBe("2026-07-01");
    expect(localDay(at("2026-01-05"))).toBe("2026-01-05");
  });
});

describe("touchActivity (daily streak)", () => {
  it("starts a streak on first activity", () => {
    const p = emptyProgress();
    touchActivity(p.meta, at("2026-07-01"));
    expect(p.meta.streak).toBe(1);
    expect(p.meta.bestStreak).toBe(1);
    expect(p.meta.lastDay).toBe("2026-07-01");
    expect(p.meta.lastT).toBe(at("2026-07-01").getTime());
  });

  it("is idempotent within the same day", () => {
    const p = emptyProgress();
    touchActivity(p.meta, at("2026-07-01"));
    touchActivity(p.meta, at("2026-07-01"));
    expect(p.meta.streak).toBe(1);
  });

  it("extends on consecutive days", () => {
    const p = emptyProgress();
    touchActivity(p.meta, at("2026-07-01"));
    touchActivity(p.meta, at("2026-07-02"));
    touchActivity(p.meta, at("2026-07-03"));
    expect(p.meta.streak).toBe(3);
    expect(p.meta.bestStreak).toBe(3);
  });

  it("resets after a gap but keeps the best", () => {
    const p = emptyProgress();
    touchActivity(p.meta, at("2026-07-01"));
    touchActivity(p.meta, at("2026-07-02"));
    touchActivity(p.meta, at("2026-07-05"));
    expect(p.meta.streak).toBe(1);
    expect(p.meta.bestStreak).toBe(2);
    expect(p.meta.lastDay).toBe("2026-07-05");
  });

  it("crosses month boundaries", () => {
    const p = emptyProgress();
    touchActivity(p.meta, at("2026-06-30"));
    touchActivity(p.meta, at("2026-07-01"));
    expect(p.meta.streak).toBe(2);
  });
});
