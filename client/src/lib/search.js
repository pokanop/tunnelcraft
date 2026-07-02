/* Search across the whole curriculum: lessons, labs, and quiz explanations.
   The index is built once at module load from the same data the views render,
   so it can never drift from the content. Scoring favors title hits, then
   headings, then body; results carry a snippet with the match highlighted. */
import { ALL_MODULES } from "../curriculum/tracks.js";

const STRIP = /[*`_#]/g; // markdown-ish markers used in lesson prose

function blockText(b) {
  if (b.p) return b.p;
  if (b.h) return b.h;
  if (b.note) return (b.label ? b.label + ": " : "") + b.note;
  if (b.ul) return b.ul.join(" ");
  if (b.code) return (b.code.title || "") + " " + (b.code.body || "");
  if (b.tbl) return [b.tbl.head.join(" "), ...b.tbl.rows.map((r) => r.join(" "))].join(" ");
  return "";
}

function clean(s) {
  return (s || "").replace(STRIP, "");
}

/* One entry per lesson, per lab, per quiz — the jumpable units of the app */
function buildIndex() {
  const out = [];
  for (const m of ALL_MODULES) {
    for (const l of m.lessons) {
      out.push({
        kind: "lesson",
        modId: m.id, code: m.code, modTitle: m.title,
        tab: l.id, title: l.title,
        text: clean(l.blocks.map(blockText).join(" \n ")),
      });
    }
    for (const ex of m.exercises || []) {
      const extra = [
        ex.prompt, ex.why,
        ...(ex.items || []),
        ...(ex.pairs || []).flatMap((p) => [p.t, p.d]),
        ex.code,
      ].filter(Boolean).join(" \n ");
      out.push({
        kind: "lab",
        modId: m.id, code: m.code, modTitle: m.title,
        tab: "lab", title: ex.title,
        text: clean(extra),
      });
    }
    if (m.quiz) {
      const qtext = m.quiz.questions.map((q) => [q.q, ...q.opts, q.why].join(" \n ")).join(" \n ");
      out.push({
        kind: "quiz",
        modId: m.id, code: m.code, modTitle: m.title,
        tab: "quiz", title: m.title + " checkpoint",
        text: clean(qtext),
      });
    }
  }
  // precompute lowercase once
  for (const e of out) {
    e.lcTitle = e.title.toLowerCase();
    e.lcText = e.text.toLowerCase();
    e.lcMod = (e.code + " " + e.modTitle).toLowerCase();
  }
  return out;
}

const INDEX = buildIndex();

function snippet(text, lcText, term, width = 150) {
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
export function search(query, limit = 20) {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  if (!terms.length) return [];
  const results = [];
  for (const e of INDEX) {
    let score = 0;
    let firstBodyTerm = null;
    let ok = true;
    for (const t of terms) {
      const inTitle = e.lcTitle.includes(t);
      const inMod = e.lcMod.includes(t);
      const inText = e.lcText.includes(t);
      if (!inTitle && !inText && !inMod) { ok = false; break; }
      if (inTitle) score += 12;
      if (inMod) score += 6;
      if (inText) { score += 2; if (!firstBodyTerm) firstBodyTerm = t; }
    }
    if (!ok) continue;
    if (e.kind === "lesson") score += 2; // lessons are the primary jump target
    results.push({
      ...e,
      score,
      snippet: snippet(e.text, e.lcText, firstBodyTerm || terms[0]),
      matchTerms: terms,
    });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export const INDEX_SIZE = INDEX.length;
