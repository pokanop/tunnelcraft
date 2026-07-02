/* Progress math shared by the map, dashboard, track pages, and shell. */
import { ALL_MODULES } from "../curriculum/tracks";
import type { Lesson, Module } from "../curriculum/types";
import type { Progress } from "./progress";

export const byId: Record<string, Module> = Object.fromEntries(ALL_MODULES.map((m) => [m.id, m]));

export function modStats(
  mod: Module,
  prog: Progress
): { total: number; done: number; pct: number } {
  const lesDone = mod.lessons.filter((l) => prog.les[l.id]).length;
  const exDone = (mod.exercises ?? []).filter((e) => prog.ex[e.id]).length;
  const quizN = mod.quiz ? 1 : 0;
  const quizDone = mod.quiz && (prog.quiz[mod.id] ?? 0) >= 70 ? 1 : 0;
  const total = mod.lessons.length + (mod.exercises ?? []).length + quizN;
  const done = lesDone + exDone + quizDone;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

export const totalHours = Math.round(
  ALL_MODULES.reduce((a, m) => a + (parseInt((m.est || "").replace(/\D/g, ""), 10) || 0), 0) / 60
);

export function grandTotals(prog: Progress): {
  total: number;
  done: number;
  pct: number;
  lessons: number;
  labs: number;
  quizzes: number;
} {
  const t = ALL_MODULES.reduce(
    (a, m) => {
      const s = modStats(m, prog);
      a.total += s.total;
      a.done += s.done;
      a.lessons += m.lessons.length;
      a.labs += (m.exercises ?? []).length;
      a.quizzes += m.quiz ? 1 : 0;
      return a;
    },
    { total: 0, done: 0, lessons: 0, labs: 0, quizzes: 0 }
  );
  return { ...t, pct: t.total ? Math.round((t.done / t.total) * 100) : 0 };
}

/* Lesson-precise resume: last visited spot if we have one, else the first
   incomplete unit (lesson → lab → quiz) of the first incomplete module. */
export function resumeTarget(prog: Progress): { id: string; tab?: string } {
  const last = prog.meta.last;
  if (last) {
    const [mid, tab] = last.split(":");
    if (mid && byId[mid]) return tab ? { id: mid, tab } : { id: mid };
  }
  for (const m of ALL_MODULES) {
    const s = modStats(m, prog);
    if (s.done < s.total) {
      const les = m.lessons.find((l) => !prog.les[l.id]);
      if (les) return { id: m.id, tab: les.id };
      if ((m.exercises ?? []).some((e) => !prog.ex[e.id])) return { id: m.id, tab: "lab" };
      return { id: m.id, tab: "quiz" };
    }
  }
  // The curriculum is never empty.
  return { id: ALL_MODULES[0]!.id };
}

export function bookmarkedLessons(prog: Progress): { mod: Module; lesson: Lesson }[] {
  const marked: { mod: Module; lesson: Lesson }[] = [];
  for (const m of ALL_MODULES)
    for (const l of m.lessons) if (prog.marks[l.id]) marked.push({ mod: m, lesson: l });
  return marked;
}
