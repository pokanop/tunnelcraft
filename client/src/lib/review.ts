/* Review engine: spaced repetition over missed quiz questions.
   Cards are keyed "modId:qIndex" and stored in the progress blob under `rev`
   so they sync/merge through the existing server pipeline.

   Card shape: { box: 0..4, due: epoch-ms, misses: n }
   Scheduling is Leitner-with-teeth (SM-2-lite): each box doubles the interval;
   a wrong answer sends the card back to box 0 (due now). */
import type { Module, Question } from "../curriculum/types";
import type { ReviewCard } from "./progress";

export const BOX_INTERVALS_DAYS = [0, 1, 3, 7, 21]; // box index → days until due

export function cardKey(modId: string, qIndex: number): string {
  return modId + ":" + qIndex;
}

/* Called when a quiz question is missed: create or demote the card. */
export function recordMiss(rev: Record<string, ReviewCard>, modId: string, qIndex: number): void {
  const k = cardKey(modId, qIndex);
  const prev = rev[k];
  rev[k] = { box: 0, due: Date.now(), misses: (prev ? prev.misses : 0) + 1 };
}

/* Called after a review answer. Right → promote a box and reschedule;
   wrong → back to box 0, due immediately. Cards that graduate past the
   last box are retired (deleted) — the fact is considered learned. */
export function recordReview(rev: Record<string, ReviewCard>, key: string, correct: boolean): void {
  const card = rev[key];
  if (!card) return;
  if (!correct) {
    rev[key] = { ...card, box: 0, due: Date.now() };
    return;
  }
  const nextBox = card.box + 1;
  const days = BOX_INTERVALS_DAYS[nextBox];
  if (days === undefined) {
    delete rev[key]; // graduated past the last box
    return;
  }
  rev[key] = { ...card, box: nextBox, due: Date.now() + days * 86_400_000 };
}

export function dueCards(
  rev: Record<string, ReviewCard> | undefined,
  now: number = Date.now()
): string[] {
  return Object.entries(rev ?? {})
    .filter(([, c]) => c.due <= now)
    .toSorted((a, b) => a[1].due - b[1].due)
    .map(([k]) => k);
}

export interface DeckStats {
  total: number;
  due: number;
  learning: number;
  maturing: number;
}

export function deckStats(
  rev: Record<string, ReviewCard> | undefined,
  now: number = Date.now()
): DeckStats {
  const entries = Object.values(rev ?? {});
  return {
    total: entries.length,
    due: entries.filter((c) => c.due <= now).length,
    learning: entries.filter((c) => c.box < 2).length,
    maturing: entries.filter((c) => c.box >= 2).length,
  };
}

export interface ResolvedCard {
  mod: Module;
  q: Question;
  qIndex: number;
}

/* Resolve a card key back to its question via the module index. */
export function resolveCard(byId: Record<string, Module>, key: string): ResolvedCard | null {
  const [modId, qi] = key.split(":");
  if (modId === undefined || qi === undefined) return null;
  const mod = byId[modId];
  const q = mod?.quiz?.questions[Number(qi)];
  return mod && q ? { mod, q, qIndex: Number(qi) } : null;
}
