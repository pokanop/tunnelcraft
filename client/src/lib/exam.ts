/* Final-exam engine: each track's exam is a timed, randomized draw over a
   large pool — every module quiz question in the track plus the supplemental
   exam bank. A fresh draw per sitting, so retakes see different papers. */
import { ALL_MODULES } from "../curriculum/tracks";
import { EXAM_BANK } from "../curriculum/exam-bank";
import type { Question, Track } from "../curriculum/types";
import { localDay } from "./progress";

export const EXAM_LEN = 24;
export const EXAM_MINUTES = 30;
export const EXAM_PASS = 75;

export interface ExamQuestion {
  q: Question;
  /** Review-deck key: "modId:qIndex" for module questions, "exam:track:i" for bank. */
  key: string;
  /** Module id for questions drawn from a module quiz. */
  modId?: string;
}

/* Local Fisher–Yates so this stays importable from tests without pulling in
   component modules. */
function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

const byId = new Map(ALL_MODULES.map((m) => [m.id, m]));

/** Every drawable question for a track: module quizzes + the exam bank. */
export function examPool(track: Track): ExamQuestion[] {
  const pool: ExamQuestion[] = [];
  for (const id of track.modules) {
    const mod = byId.get(id);
    mod?.quiz?.questions.forEach((q, i) => pool.push({ q, key: mod.id + ":" + i, modId: mod.id }));
  }
  (EXAM_BANK[track.id] ?? []).forEach((q, i) =>
    pool.push({ q, key: "exam:" + track.id + ":" + i })
  );
  return pool;
}

/** One sitting: a random sample of the pool (the whole pool if it's small). */
export function buildExam(track: Track, n: number = EXAM_LEN): ExamQuestion[] {
  return shuffle(examPool(track)).slice(0, n);
}

/** Certificate serial — deterministic from track, day, and score. */
export function certCode(track: Track, score: number, day: string = localDay()): string {
  return "TC-" + track.id.toUpperCase() + "-" + day.replaceAll("-", "") + "-" + score;
}
