/* The curriculum map: every track, module, exam, and your progress. */
import { Link } from "@tanstack/react-router";
import { LayerGlyph } from "../lib/render";
import { deckStats } from "../lib/review";
import { ALL_MODULES, TRACKS } from "../curriculum/tracks";
import { EXAM_LEN, EXAM_MINUTES, EXAM_PASS } from "../lib/exam";
import { byId, bookmarkedLessons, grandTotals, modStats, resumeTarget } from "../lib/stats";
import { useApp } from "../App";

export function LearnPage() {
  const { prog, go, user } = useApp();
  const totals = grandTotals(prog);
  const started = totals.done > 0;
  const finished = totals.done >= totals.total;
  const streak = prog.meta.streak ?? 0;
  const deck = deckStats(prog.rev);
  const finalsPassed = TRACKS.filter((t) => (prog.meta.finals?.[t.id] ?? 0) >= EXAM_PASS).length;
  const marked = bookmarkedLessons(prog);
  const resume = resumeTarget(prog);

  return (
    <div className="wrap">
      <section className="maphead">
        <div>
          <p className="eyebrow">FIELD MAP // {ALL_MODULES.length} MODULES · 4 TRACKS</p>
          <h1 className="maph1">Curriculum</h1>
          <p className="sub mapsub">
            Work top to bottom or jump anywhere — every lesson, lab, and quiz is tracked.
            {!user && " Progress stays on this device until you sign in."}
          </p>
        </div>
        <div className="mapcta">
          <button className="btn" onClick={() => go({ v: "mod", ...resume })}>
            {finished ? "REVISIT THE MAP" : started ? "RESUME TRAINING →" : "BEGIN TRANSMISSION →"}
          </button>
          <span className="mapcta-pct">{totals.pct}% COMPLETE</span>
        </div>
      </section>

      {started && (
        <section className="fieldrec">
          <p className="gridttl">// FIELD RECORD</p>
          <div className="stats">
            <div className="stat">
              <b>{streak > 0 ? "⚡" + streak : "—"}</b>
              <span>day streak</span>
            </div>
            <div className="stat">
              <b>{prog.meta.bestStreak ?? 0}</b>
              <span>best streak</span>
            </div>
            <div className="stat">
              <b>{deck.due}</b>
              <span>cards due</span>
            </div>
            <div className="stat">
              <b>{deck.total}</b>
              <span>review deck</span>
            </div>
            <div className="stat">
              <b>
                {finalsPassed}/{TRACKS.length}
              </b>
              <span>finals passed</span>
            </div>
          </div>
          {deck.due > 0 && (
            <button className="btn ghost fieldrec-btn" onClick={() => go({ v: "review" })}>
              CLEAR {deck.due} DUE CARD{deck.due > 1 ? "S" : ""} →
            </button>
          )}
        </section>
      )}

      {marked.length > 0 && (
        <section className="bookmarks">
          <p className="gridttl">// BOOKMARKED LESSONS</p>
          <div className="marklist">
            {marked.map(({ mod, lesson }) => (
              <button
                key={lesson.id}
                className="markrow"
                onClick={() => go({ v: "mod", id: mod.id, tab: lesson.id })}
              >
                <span className="markcode">{mod.code}</span>
                <span className="markttl">{lesson.title}</span>
                <span className="markest">{lesson.est}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {TRACKS.map((tr) => {
        const mods = tr.modules.flatMap((id) => byId[id] ?? []);
        const t = mods.reduce(
          (a, m) => {
            const s = modStats(m, prog);
            a.t += s.total;
            a.d += s.done;
            return a;
          },
          { t: 0, d: 0 }
        );
        const tpct = t.t ? Math.round((t.d / t.t) * 100) : 0;
        const final = prog.meta.finals?.[tr.id];
        const certified = final !== undefined && final >= EXAM_PASS;
        return (
          <section key={tr.id} className="trackblock">
            <div className="trackhead">
              <div>
                <p className="gridttl">
                  // {tr.code} —{" "}
                  <Link to="/tracks/$trackId" params={{ trackId: tr.id }} className="tracklink">
                    {tr.title.toUpperCase()}
                  </Link>
                </p>
                <p className="trackblurb">{tr.blurb}</p>
              </div>
              <div className="trackpct">{tpct}%</div>
            </div>
            <div className="trackexam">
              <span className="trackexam-t">
                FINAL EXAM · {EXAM_LEN} QUESTIONS · {EXAM_MINUTES} MIN · PASS {EXAM_PASS}%
              </span>
              <span className={"trackexam-s" + (certified ? " certok" : "")}>
                {certified
                  ? "✓ CERTIFIED — BEST " + final + "%"
                  : final !== undefined
                    ? "BEST " + final + "%"
                    : "NOT ATTEMPTED"}
              </span>
              <button
                className="btn ghost trackexam-btn"
                onClick={() => go({ v: "exam", track: tr.id })}
              >
                {certified ? "RETAKE →" : final !== undefined ? "TRY AGAIN →" : "SIT THE EXAM →"}
              </button>
            </div>
            <div className="grid">
              {mods.map((m) => {
                const s = modStats(m, prog);
                const full = s.pct === 100;
                return (
                  <button key={m.id} className="card" onClick={() => go({ v: "mod", id: m.id })}>
                    <LayerGlyph on={m.layers} />
                    <div className="card-body">
                      <div className={"card-code" + (full ? " done" : "")}>
                        {full ? "✓ " + m.code : m.code}
                        <span style={{ float: "right", color: "var(--dim)", fontWeight: 400 }}>
                          {m.est}
                        </span>
                      </div>
                      <div className="card-title">{m.title}</div>
                      <div className="card-tag">{m.tag}</div>
                      <div className="card-meta">
                        {m.lessons.length} lessons
                        {(m.exercises ?? []).length
                          ? " · " +
                            (m.exercises ?? []).length +
                            " lab" +
                            ((m.exercises ?? []).length > 1 ? "s" : "")
                          : ""}
                        {m.quiz ? " · quiz" : ""}
                      </div>
                      <div className="minibar">
                        <i style={{ width: s.pct + "%" }} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
