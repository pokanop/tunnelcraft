import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BOX_INTERVALS_DAYS,
  cardKey,
  recordMiss,
  recordMissCard,
  recordReview,
  resolveCard,
  dueCards,
  deckStats,
} from "./review";
import type { CardQuestion, ReviewCard } from "./progress";
import type { Module } from "../curriculum/types";

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

describe("self-contained cards (drills, exam bank)", () => {
  const Q: CardQuestion = {
    q: "Which port does SSH use?",
    opts: ["21", "22", "23"],
    a: 1,
    why: "SSH is 22.",
  };

  it("recordMissCard embeds the question and source label", () => {
    const rev: Record<string, ReviewCard> = {};
    recordMissCard(rev, "drill:port:22", Q, "PORT DRILL");
    expect(rev["drill:port:22"]).toEqual({
      box: 0,
      due: NOW,
      misses: 1,
      q: Q,
      src: "PORT DRILL",
    });
  });

  it("resolveCard prefers the embedded payload over module lookup", () => {
    const rev: Record<string, ReviewCard> = {};
    recordMissCard(rev, "drill:port:22", Q, "PORT DRILL");
    const r = resolveCard({}, "drill:port:22", rev["drill:port:22"]);
    expect(r?.q).toEqual(Q);
    expect(r?.src).toBe("PORT DRILL");
    expect(r?.mod).toBeUndefined();
  });

  it("resolveCard still resolves module-backed keys", () => {
    const mod = {
      id: "n01",
      code: "N01",
      title: "Test",
      layers: [],
      est: "",
      tag: "",
      lessons: [],
      quiz: { id: "q", questions: [{ q: "?", opts: ["a", "b"], a: 0, why: "" }] },
    } as unknown as Module;
    const r = resolveCard({ n01: mod }, "n01:0", { box: 0, due: NOW, misses: 1 });
    expect(r?.mod).toBe(mod);
    expect(r?.qIndex).toBe(0);
    expect(r?.src).toContain("N01");
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
