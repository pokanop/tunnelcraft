import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BOX_INTERVALS_DAYS,
  cardKey,
  recordMiss,
  recordReview,
  dueCards,
  deckStats,
} from "./review";
import type { ReviewCard } from "./progress";

const DAY = 86_400_000;
const NOW = 1_750_000_000_000;

beforeEach(() => vi.useFakeTimers({ now: NOW }));
afterEach(() => vi.useRealTimers());

describe("recordMiss", () => {
  it("creates a box-0 card due now", () => {
    const rev: Record<string, ReviewCard> = {};
    recordMiss(rev, "n01", 3);
    expect(rev[cardKey("n01", 3)]).toEqual({ box: 0, due: NOW, misses: 1 });
  });

  it("demotes an existing card and counts the miss", () => {
    const rev: Record<string, ReviewCard> = { "n01:3": { box: 3, due: NOW + 7 * DAY, misses: 1 } };
    recordMiss(rev, "n01", 3);
    expect(rev["n01:3"]).toEqual({ box: 0, due: NOW, misses: 2 });
  });
});

describe("recordReview", () => {
  it("promotes one box and schedules by the interval table", () => {
    const rev: Record<string, ReviewCard> = { k: { box: 0, due: NOW, misses: 1 } };
    recordReview(rev, "k", true);
    expect(rev["k"]?.box).toBe(1);
    // BOX_INTERVALS_DAYS[1] exists by construction of the interval table
    expect(rev["k"]?.due).toBe(NOW + BOX_INTERVALS_DAYS[1]! * DAY);
  });

  it("a wrong answer sends the card back to box 0, due immediately", () => {
    const rev: Record<string, ReviewCard> = { k: { box: 3, due: NOW + 7 * DAY, misses: 1 } };
    recordReview(rev, "k", false);
    expect(rev["k"]?.box).toBe(0);
    expect(rev["k"]?.due).toBe(NOW);
  });

  it("graduates (deletes) a card promoted past the last box", () => {
    const rev: Record<string, ReviewCard> = {
      k: { box: BOX_INTERVALS_DAYS.length - 1, due: NOW, misses: 2 },
    };
    recordReview(rev, "k", true);
    expect(rev["k"]).toBeUndefined();
  });

  it("ignores unknown keys", () => {
    const rev: Record<string, ReviewCard> = {};
    recordReview(rev, "nope", true);
    expect(rev).toEqual({});
  });
});

describe("dueCards", () => {
  it("returns only due cards, oldest first", () => {
    const rev: Record<string, ReviewCard> = {
      a: { box: 1, due: NOW - 2 * DAY, misses: 1 },
      b: { box: 1, due: NOW - 5 * DAY, misses: 1 },
      c: { box: 2, due: NOW + DAY, misses: 1 },
    };
    expect(dueCards(rev, NOW)).toEqual(["b", "a"]);
  });

  it("handles an empty/missing deck", () => {
    expect(dueCards({}, NOW)).toEqual([]);
    expect(dueCards(undefined, NOW)).toEqual([]);
  });
});

describe("deckStats", () => {
  it("counts total, due, learning (box<2) and maturing (box>=2)", () => {
    const rev: Record<string, ReviewCard> = {
      a: { box: 0, due: NOW - 1, misses: 1 },
      b: { box: 1, due: NOW + DAY, misses: 1 },
      c: { box: 3, due: NOW - 1, misses: 1 },
    };
    expect(deckStats(rev, NOW)).toEqual({ total: 3, due: 2, learning: 2, maturing: 1 });
  });
});
