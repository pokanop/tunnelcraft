/* The progress blob: synced to the server, merged field-wise there and here.
   Server-side sanitize/merge (server/src/progress.ts) mirrors these shapes. */

/** Question payload for cards that aren't backed by a module quiz
    (generated drills, exam-bank questions) — same shape as curriculum Question. */
export interface CardQuestion {
  q: string;
  opts: string[];
  /** Index into opts of the correct answer. */
  a: number;
  why: string;
}

/** Leitner card, keyed "modId:qIndex" for quiz misses, or an opaque
    "drill:…" / "exam:…" key for self-contained cards. */
export interface ReviewCard {
  /** Leitner box 0..4 — resets to 0 on a miss. */
  box: number;
  /** Epoch ms when the card is next due. */
  due: number;
  misses: number;
  /** Embedded question for cards not resolvable from a module quiz. */
  q?: CardQuestion;
  /** Short source label shown in review mode, e.g. "PORT DRILL". */
  src?: string;
}

export interface Note {
  /** Note text. */
  v: string;
  /** Last-edit epoch ms — newest wins on merge. */
  t: number;
}

export interface ProgressMeta {
  streak?: number;
  bestStreak?: number;
  /** ISO date (YYYY-MM-DD) of the last active day. */
  lastDay?: string;
  /** Last visited location: "modId" or "modId:tab" (tab = lesson id, "lab", "quiz"). */
  last?: string | null;
  lastT?: number;
  /** Best final-exam score per track id, 0..100. */
  finals?: Record<string, number>;
}

export interface Progress {
  /** Lessons completed, keyed lesson id. */
  les: Record<string, boolean>;
  /** Best quiz score per module id, 0..100. */
  quiz: Record<string, number>;
  /** Exercises completed, keyed exercise id. */
  ex: Record<string, boolean>;
  /** Capstone checklist items done, keyed item id. */
  cap: Record<string, boolean>;
  /** Spaced-repetition deck. */
  rev: Record<string, ReviewCard>;
  /** Per-lesson notes. */
  notes: Record<string, Note>;
  /** Bookmarks, keyed lesson id. */
  marks: Record<string, boolean>;
  meta: ProgressMeta;
}

export function emptyProgress(): Progress {
  return { les: {}, quiz: {}, ex: {}, cap: {}, rev: {}, notes: {}, marks: {}, meta: {} };
}

/** Local calendar day as YYYY-MM-DD (streaks follow the learner's clock, not UTC). */
export function localDay(d: Date = new Date()): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

/** Record activity "now": maintains the daily streak and the last-active stamp.
    Consecutive-day activity extends the streak; a gap resets it to 1. */
export function touchActivity(meta: ProgressMeta, now: Date = new Date()): void {
  const today = localDay(now);
  if (meta.lastDay !== today) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    meta.streak = meta.lastDay === localDay(yesterday) ? (meta.streak ?? 0) + 1 : 1;
    meta.lastDay = today;
  }
  meta.bestStreak = Math.max(meta.bestStreak ?? 0, meta.streak ?? 0);
  meta.lastT = now.getTime();
}
