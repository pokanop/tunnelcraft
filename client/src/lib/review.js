/* Review engine: spaced repetition over missed quiz questions.
   Cards are keyed "modId:qIndex" and stored in the progress blob under `rev`
   so they sync/merge through the existing server pipeline.

   Card shape: { box: 0..4, due: epoch-ms, misses: n }
   Scheduling is Leitner-with-teeth (SM-2-lite): each box doubles the interval;
   a wrong answer sends the card back to box 0 (due now). */

export const BOX_INTERVALS_DAYS = [0, 1, 3, 7, 21]; // box index → days until due

export function cardKey(modId, qIndex) {
  return modId + ":" + qIndex;
}

/* Called when a quiz question is missed: create or demote the card. */
export function recordMiss(rev, modId, qIndex) {
  const k = cardKey(modId, qIndex);
  const prev = rev[k];
  rev[k] = { box: 0, due: Date.now(), misses: (prev ? prev.misses : 0) + 1 };
}

/* Called after a review answer. Right → promote a box and reschedule;
   wrong → back to box 0, due immediately. Cards that graduate past the
   last box are retired (deleted) — the fact is considered learned. */
export function recordReview(rev, key, correct) {
  const card = rev[key];
  if (!card) return;
  if (!correct) {
    rev[key] = { ...card, box: 0, due: Date.now() };
    return;
  }
  const nextBox = card.box + 1;
  if (nextBox >= BOX_INTERVALS_DAYS.length) {
    delete rev[key]; // graduated
    return;
  }
  rev[key] = { ...card, box: nextBox, due: Date.now() + BOX_INTERVALS_DAYS[nextBox] * 86_400_000 };
}

export function dueCards(rev, now = Date.now()) {
  return Object.entries(rev || {})
    .filter(([, c]) => c.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([k]) => k);
}

export function deckStats(rev, now = Date.now()) {
  const entries = Object.values(rev || {});
  return {
    total: entries.length,
    due: entries.filter((c) => c.due <= now).length,
    learning: entries.filter((c) => c.box < 2).length,
    maturing: entries.filter((c) => c.box >= 2).length,
  };
}

/* Resolve a card key back to its question via the module index. */
export function resolveCard(byId, key) {
  const [modId, qi] = key.split(":");
  const mod = byId[modId];
  const q = mod && mod.quiz && mod.quiz.questions[Number(qi)];
  return q ? { mod, q, qIndex: Number(qi) } : null;
}
