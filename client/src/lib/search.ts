/* Search across the whole curriculum: lessons, labs, and quiz explanations.
   The index is built once at module load from the same data the views render,
   so it can never drift from the content. Scoring favors title hits, then
   headings, then body; results carry a snippet with the match highlighted. */
import { ALL_MODULES } from "../curriculum/tracks";
import type { Block, Module } from "../curriculum/types";

const STRIP = /[*`_#]/g; // markdown-ish markers used in lesson prose

function blockText(b: Block): string {
  if ("p" in b) return b.p;
  if ("h" in b) return b.h;
  if ("note" in b) return (b.label ? b.label + ": " : "") + b.note;
  if ("ul" in b) return b.ul.join(" ");
  if ("code" in b) return (b.code.title || "") + " " + (b.code.body || "");
  if ("tbl" in b) return [b.tbl.head.join(" "), ...b.tbl.rows.map((r) => r.join(" "))].join(" ");
  return "";
}

function clean(s: string): string {
  return (s || "").replace(STRIP, "");
}

export type SearchKind = "lesson" | "lab" | "quiz";

export interface SearchEntry {
  kind: SearchKind;
  modId: string;
  code: string;
  modTitle: string;
  /** Jump target within the module: a lesson id, "lab", or "quiz". */
  tab: string;
  title: string;
  text: string;
  lcTitle: string;
  lcText: string;
  lcMod: string;
}

export interface SearchResult extends SearchEntry {
  score: number;
  snippet: string;
  matchTerms: string[];
}

function makeEntry(
  kind: SearchKind,
  m: Module,
  tab: string,
  title: string,
  text: string
): SearchEntry {
  return {
    kind,
    modId: m.id,
    code: m.code,
    modTitle: m.title,
    tab,
    title,
    text,
    // precompute lowercase once
    lcTitle: title.toLowerCase(),
    lcText: text.toLowerCase(),
    lcMod: (m.code + " " + m.title).toLowerCase(),
  };
}

/* One entry per lesson, per lab, per quiz — the jumpable units of the app */
function buildIndex(): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const m of ALL_MODULES) {
    for (const l of m.lessons) {
      out.push(makeEntry("lesson", m, l.id, l.title, clean(l.blocks.map(blockText).join(" \n "))));
    }
    for (const ex of m.exercises ?? []) {
      const extra = [
        ex.prompt,
        ex.why,
        ...("items" in ex ? ex.items : []),
        ...("pairs" in ex ? ex.pairs.flatMap((p) => [p.t, p.d]) : []),
        ...("code" in ex ? [ex.code] : []),
      ]
        .filter((s): s is string => Boolean(s))
        .join(" \n ");
      out.push(makeEntry("lab", m, "lab", ex.title, clean(extra)));
    }
    if (m.quiz) {
      const qtext = m.quiz.questions.map((q) => [q.q, ...q.opts, q.why].join(" \n ")).join(" \n ");
      out.push(makeEntry("quiz", m, "quiz", m.title + " checkpoint", clean(qtext)));
    }
  }
  return out;
}

const INDEX = buildIndex();

function snippet(text: string, lcText: string, term: string, width = 150): string {
  const at = lcText.indexOf(term);
  if (at < 0) return text.slice(0, width) + (text.length > width ? "…" : "");
  const start = Math.max(0, at - Math.floor((width - term.length) / 2));
  const end = Math.min(text.length, start + width);
  let s = text.slice(start, end);
  if (start > 0) s = "…" + s;
  if (end < text.length) s += "…";
  return s;
}

/* AND-match every query token; score = weighted hit locations */
export function search(query: string, limit = 20): SearchResult[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const [firstTerm] = terms;
  if (firstTerm === undefined) return [];
  const results: SearchResult[] = [];
  for (const e of INDEX) {
    let score = 0;
    let firstBodyTerm: string | null = null;
    let ok = true;
    for (const t of terms) {
      const inTitle = e.lcTitle.includes(t);
      const inMod = e.lcMod.includes(t);
      const inText = e.lcText.includes(t);
      if (!inTitle && !inText && !inMod) {
        ok = false;
        break;
      }
      if (inTitle) score += 12;
      if (inMod) score += 6;
      if (inText) {
        score += 2;
        if (!firstBodyTerm) firstBodyTerm = t;
      }
    }
    if (!ok) continue;
    if (e.kind === "lesson") score += 2; // lessons are the primary jump target
    results.push({
      ...e,
      score,
      snippet: snippet(e.text, e.lcText, firstBodyTerm ?? firstTerm),
      matchTerms: terms,
    });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export const INDEX_SIZE = INDEX.length;
