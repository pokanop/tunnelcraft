import { describe, expect, it } from "bun:test";
import { guidanceLevel, HINT_AFTER, REVEAL_AFTER, recordAttempt } from "./guidance";

describe("guidance thresholds", () => {
  it("escalates after configured wrong-attempt counts", () => {
    expect(HINT_AFTER).toBe(3);
    expect(REVEAL_AFTER).toBe(5);
    expect(guidanceLevel(0)).toBe("none");
    expect(guidanceLevel(2)).toBe("none");
    expect(guidanceLevel(3)).toBe("hint");
    expect(guidanceLevel(4)).toBe("hint");
    expect(guidanceLevel(5)).toBe("reveal");
    expect(guidanceLevel(9)).toBe("reveal");
  });

  it("increments per-question attempt counters immutably", () => {
    const a = recordAttempt({}, 2);
    expect(a[2]).toBe(1);
    const b = recordAttempt(a, 2);
    expect(b[2]).toBe(2);
    expect(a[2]).toBe(1);
  });
});
