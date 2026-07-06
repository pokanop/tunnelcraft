/** Progressive help thresholds — shared across drills, labs, and quizzes. */

export const HINT_AFTER = 3;
export const REVEAL_AFTER = 5;

export type GuidanceLevel = "none" | "hint" | "reveal";

export function guidanceLevel(attempts: number): GuidanceLevel {
  if (attempts >= REVEAL_AFTER) return "reveal";
  if (attempts >= HINT_AFTER) return "hint";
  return "none";
}

export function recordAttempt(counts: Record<number, number>, index: number): Record<number, number> {
  return { ...counts, [index]: (counts[index] ?? 0) + 1 };
}
