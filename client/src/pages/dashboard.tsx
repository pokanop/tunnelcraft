/* Post-login dashboard: resume, momentum, review debt, track status. */
import { Navigate } from "@tanstack/react-router";
import { getToken } from "../lib/api";
import { deckStats } from "../lib/review";
import { TRACKS } from "../curriculum/tracks";
import { EXAM_PASS } from "../lib/exam";
import { byId, bookmarkedLessons, grandTotals, modStats, resumeTarget } from "../lib/stats";
import { useApp } from "../App";

export function DashboardPage() {
  const { prog, go, user } = useApp();
  if (!getToken()) return <Navigate to="/learn" replace />;

  const totals = grandTotals(prog);
  const started = totals.done > 0;
  const finished = totals.done >= totals.total;
  const deck = deckStats(prog.rev);
  const marked = bookmarkedLessons(prog);
  const resume = resumeTarget(prog);
  const resumeMod = byId[resume.id];
  const resumeLesson = resume.tab ? resumeMod?.lessons.find((l) => l.id === resume.tab) : undefined;
  const hour = new Date().getHours();
  const greeting =
    hour < 5
      ? "Night shift"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";
  const name = user?.displayName || user?.email.split("@")[0] || "operator";

  return (
    <div className="wrap">
      <section className="dash-head">
        <p className="eyebrow">
          OPERATOR CONSOLE //{" "}
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        <h1 className="maph1">
          {greeting}, {name}.
        </h1>
        <p className="sub mapsub">
          {finished
            ? "Full path complete. The map is yours to revisit — and the finals are always open."
            : started
              ? totals.pct + "% of the path behind you. The wire is waiting."
              : "Your path starts at the first packet. Begin whenever you're ready."}
        </p>
      </section>

      {/* resume card */}
      <section className="dash-resume">
        <div className="dash-resume-body">
          <p className="gridttl">
            //{" "}
            {finished ? "REVISIT" : started ? "PICK UP WHERE YOU LEFT OFF" : "FIRST TRANSMISSION"}
          </p>
          {resumeMod && (
            <>
              <h2 className="dash-resume-ttl">
                {resumeMod.code} — {resumeMod.title}
              </h2>
              {resumeLesson && (
                <p className="dash-resume-les">
                  ▸ {resumeLesson.title} · {resumeLesson.est}
                </p>
              )}
            </>
          )}
        </div>
        <button className="btn" onClick={() => go({ v: "mod", ...resume })}>
          {finished ? "OPEN THE MAP →" : started ? "RESUME →" : "BEGIN →"}
        </button>
      </section>

      {/* field record */}
      <section className="fieldrec">
        <p className="gridttl">// FIELD RECORD</p>
        <div className="stats">
          <div className="stat">
            <b>{(prog.meta.streak ?? 0) > 0 ? "⚡" + prog.meta.streak : "—"}</b>
            <span>day streak</span>
          </div>
          <div className="stat">
            <b>{prog.meta.bestStreak ?? 0}</b>
            <span>best streak</span>
          </div>
          <div className="stat">
            <b>
              {totals.done}/{totals.total}
            </b>
            <span>units done</span>
          </div>
          <div className="stat">
            <b>{deck.due}</b>
            <span>cards due</span>
          </div>
          <div className="stat">
            <b>
              {TRACKS.filter((t) => (prog.meta.finals?.[t.id] ?? 0) >= EXAM_PASS).length}/
              {TRACKS.length}
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

      {/* track status */}
      <section>
        <p className="gridttl">// TRACK STATUS</p>
        <div className="dash-tracks">
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
              <button
                key={tr.id}
                className="dash-track"
                onClick={() => go({ v: "track", id: tr.id })}
              >
                <span className="land-track-code">{tr.code}</span>
                <span className="dash-track-ttl">{tr.title}</span>
                <span className="minibar">
                  <i style={{ width: tpct + "%" }} />
                </span>
                <span className="dash-track-meta">
                  <span>{tpct}%</span>
                  <span className={certified ? "certok" : ""}>
                    {certified
                      ? "✓ CERTIFIED"
                      : final !== undefined
                        ? "BEST " + final + "%"
                        : "FINAL NOT TAKEN"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* bookmarks */}
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

      <div className="land-cta" style={{ margin: "8px 0 30px" }}>
        <button className="btn ghost" onClick={() => go({ v: "home" })}>
          OPEN THE FULL MAP →
        </button>
        <button className="btn ghost" onClick={() => go({ v: "glossary" })}>
          GLOSSARY
        </button>
      </div>
    </div>
  );
}
