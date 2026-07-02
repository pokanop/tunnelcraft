/* The progress blob: sanitized on write, merged field-wise on sync.
   These shapes mirror client/src/lib/progress.ts — keep the two in step
   (the workspaces intentionally do not import across each other). */

/** Question payload for self-contained review cards (drills, exam bank). */
export interface CardQuestion {
  q: string;
  opts: string[];
  a: number;
  why: string;
}

/** Leitner card, keyed "modId:qIndex" for quiz misses, or an opaque
    "drill:…" / "exam:…" key for self-contained cards. */
export interface ReviewCard {
  box: number;
  /** Epoch ms when the card is next due. */
  due: number;
  misses: number;
  /** Embedded question for cards not resolvable from a module quiz. */
  q?: CardQuestion;
  /** Short source label shown in review mode. */
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
  /** Module id of the most recent activity. */
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

export const EMPTY: Progress = {
  les: {},
  quiz: {},
  ex: {},
  cap: {},
  rev: {},
  notes: {},
  marks: {},
  meta: {},
};

const LIMITS = {
  rev: 3000,
  notes: 500,
  noteLen: 4000,
  cardQ: 500,
  cardOpt: 240,
  cardOpts: 8,
  cardWhy: 1000,
  cardSrc: 80,
} as const;

/** Validate an embedded card question from an untrusted blob; null if malformed. */
function sanitizeCardQuestion(v: unknown): CardQuestion | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.q !== "string" || !r.q || !Array.isArray(r.opts)) return null;
  const opts = r.opts
    .filter((o): o is string => typeof o === "string")
    .slice(0, LIMITS.cardOpts)
    .map((o) => o.slice(0, LIMITS.cardOpt));
  const a = Math.round(Number(r.a));
  if (opts.length < 2 || !Number.isFinite(a) || a < 0 || a >= opts.length) return null;
  return {
    q: r.q.slice(0, LIMITS.cardQ),
    opts,
    a,
    why: typeof r.why === "string" ? r.why.slice(0, LIMITS.cardWhy) : "",
  };
}

/** The four "set of done ids" maps that merge by plain union. */
const BOOL_KEYS = ["les", "ex", "cap", "marks"] as const;

function emptyProgress(): Progress {
  return { les: {}, quiz: {}, ex: {}, cap: {}, rev: {}, notes: {}, marks: {}, meta: {} };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

const okId = (id: unknown): id is string => typeof id === "string" && id.length <= 64;

export function mergeProgress(a: Progress, b: Progress): Progress {
  const out = emptyProgress();
  for (const k of BOOL_KEYS) Object.assign(out[k], a[k], b[k]);
  const qa = a.quiz,
    qb = b.quiz;
  for (const id of new Set([...Object.keys(qa), ...Object.keys(qb)]))
    out.quiz[id] = Math.max(qa[id] ?? 0, qb[id] ?? 0);
  const ra = a.rev,
    rb = b.rev;
  for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    const x = ra[k],
      y = rb[k];
    let winner: ReviewCard | undefined;
    if (!x || !y) winner = x || y;
    else if (x.box !== y.box) winner = x.box < y.box ? x : y;
    else {
      winner = {
        box: x.box,
        due: Math.min(x.due, y.due),
        misses: Math.max(x.misses || 0, y.misses || 0),
      };
      const q = x.q ?? y.q;
      const src = x.src ?? y.src;
      if (q) winner.q = q;
      if (src) winner.src = src;
    }
    if (winner) out.rev[k] = winner;
  }
  const na = a.notes,
    nb = b.notes;
  for (const k of new Set([...Object.keys(na), ...Object.keys(nb)])) {
    const x = na[k],
      y = nb[k];
    const newest = !x ? y : !y ? x : (x.t || 0) >= (y.t || 0) ? x : y;
    if (newest) out.notes[k] = newest;
  }
  const ma = a.meta,
    mb = b.meta;
  const finals: Record<string, number> = {};
  const maf = ma.finals ?? {},
    mbf = mb.finals ?? {};
  for (const k of new Set([...Object.keys(maf), ...Object.keys(mbf)]))
    finals[k] = Math.max(maf[k] ?? 0, mbf[k] ?? 0);
  out.meta = {
    streak: Math.max(ma.streak || 0, mb.streak || 0),
    bestStreak: Math.max(ma.bestStreak || 0, mb.bestStreak || 0),
    lastDay: (ma.lastDay || "") > (mb.lastDay || "") ? ma.lastDay || "" : mb.lastDay || "",
    last: (ma.lastT || 0) >= (mb.lastT || 0) ? ma.last || null : mb.last || null,
    lastT: Math.max(ma.lastT || 0, mb.lastT || 0),
    finals,
  };
  return out;
}

export function sanitizeProgress(p: unknown): Progress {
  if (!isRecord(p)) return JSON.parse(JSON.stringify(EMPTY)) as Progress;
  const out = emptyProgress();
  for (const k of BOOL_KEYS) {
    const src = p[k];
    if (isRecord(src))
      for (const [id, v] of Object.entries(src)) if (okId(id) && v === true) out[k][id] = true;
  }
  if (isRecord(p.quiz))
    for (const [id, v] of Object.entries(p.quiz)) {
      const n = Number(v);
      if (okId(id) && Number.isFinite(n)) out.quiz[id] = Math.max(0, Math.min(100, Math.round(n)));
    }
  if (isRecord(p.rev))
    for (const [id, c] of Object.entries(p.rev).slice(0, LIMITS.rev)) {
      if (!okId(id) || !isRecord(c)) continue;
      const box = Math.max(0, Math.min(8, Math.round(Number(c.box) || 0)));
      const due = Number(c.due);
      const misses = Math.max(0, Math.min(999, Math.round(Number(c.misses) || 0)));
      if (!Number.isFinite(due)) continue;
      const card: ReviewCard = { box, due, misses };
      const eq = sanitizeCardQuestion(c.q);
      if (eq) card.q = eq;
      if (typeof c.src === "string" && c.src) card.src = c.src.slice(0, LIMITS.cardSrc);
      out.rev[id] = card;
    }
  if (isRecord(p.notes))
    for (const [id, n] of Object.entries(p.notes).slice(0, LIMITS.notes)) {
      if (!okId(id) || !isRecord(n) || typeof n.v !== "string") continue;
      out.notes[id] = { v: n.v.slice(0, LIMITS.noteLen), t: Number(n.t) || 0 };
    }
  const m = p.meta;
  if (isRecord(m)) {
    const finals: Record<string, number> = {};
    if (isRecord(m.finals))
      for (const [k, v] of Object.entries(m.finals))
        if (okId(k) && Number.isFinite(Number(v)))
          finals[k] = Math.max(0, Math.min(100, Math.round(Number(v))));
    const last = m.last;
    out.meta = {
      streak: Math.max(0, Math.min(100000, Math.round(Number(m.streak) || 0))),
      bestStreak: Math.max(0, Math.min(100000, Math.round(Number(m.bestStreak) || 0))),
      lastDay: typeof m.lastDay === "string" ? m.lastDay.slice(0, 10) : "",
      last: okId(last) ? last : null,
      lastT: Number(m.lastT) || 0,
      finals,
    };
  }
  return out;
}
