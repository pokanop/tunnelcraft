import { useEffect, useMemo, useRef, useState } from "react";
import { md } from "../lib/render";
import { shuffle } from "./exercises";
import { buildExam, certCode, examPool, EXAM_LEN, EXAM_MINUTES, EXAM_PASS } from "../lib/exam";
import { recordMiss, recordMissCard } from "../lib/review";
import { localDay } from "../lib/progress";
import type { ExamQuestion } from "../lib/exam";
import type { Progress } from "../lib/progress";
import type { PublicUser } from "../lib/api";
import type { Track } from "../curriculum/types";
import type { Route } from "../lib/nav";

/* Final exam: a timed, randomized paper drawn fresh each sitting from the
   track's full question pool. Pass ≥ EXAM_PASS% → printable certificate.
   Misses land in the spaced-repetition deck like any other wrong answer. */
interface ExamViewProps {
  track: Track;
  user: PublicUser | null;
  prog: Progress;
  update: (fn: (p: Progress) => void) => void;
  go: (r: Route) => void;
}

type Phase = "intro" | "run" | "done";

function fmtClock(s: number): string {
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

/* Print with a document-level marker class so print CSS shows only the
   certificate; cleaned up after the print dialog closes. */
function certPrintDone(): void {
  document.documentElement.classList.remove("cert-print");
  window.removeEventListener("afterprint", certPrintDone);
}
function printCert(): void {
  document.documentElement.classList.add("cert-print");
  window.addEventListener("afterprint", certPrintDone);
  window.print();
}

export function ExamView({ track, user, prog, update, go }: ExamViewProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [paper, setPaper] = useState<ExamQuestion[]>([]);
  const [sel, setSel] = useState<Record<number, number>>({});
  const [left, setLeft] = useState(EXAM_MINUTES * 60);
  const [timedOut, setTimedOut] = useState(false);
  const [lastPct, setLastPct] = useState<number | null>(null);
  const submittedRef = useRef(false);
  const selRef = useRef(sel);
  selRef.current = sel;
  const paperRef = useRef(paper);
  paperRef.current = paper;

  const poolSize = useMemo(() => examPool(track).length, [track.id]);
  // Stable per-question option shuffle for the current paper
  const optOrder = useMemo(() => paper.map((eq) => shuffle(eq.q.opts.map((_, i) => i))), [paper]);
  const best = prog.meta.finals?.[track.id];
  const passedBest = best !== undefined && best >= EXAM_PASS;

  const start = () => {
    setPaper(buildExam(track));
    setSel({});
    setLeft(EXAM_MINUTES * 60);
    setTimedOut(false);
    setLastPct(null);
    submittedRef.current = false;
    setPhase("run");
    window.scrollTo(0, 0);
  };

  const submit = (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const p = paperRef.current;
    const s = selRef.current;
    const right = p.reduce((n, eq, i) => n + (s[i] === eq.q.a ? 1 : 0), 0);
    const pct = p.length ? Math.round((right / p.length) * 100) : 0;
    setLastPct(pct);
    setTimedOut(auto);
    update((pr) => {
      const finals = pr.meta.finals ?? {};
      finals[track.id] = Math.max(finals[track.id] ?? 0, pct);
      pr.meta.finals = finals;
      p.forEach((eq, i) => {
        if (s[i] === eq.q.a) return;
        if (eq.modId !== undefined) {
          const qi = Number(eq.key.split(":")[1]);
          recordMiss(pr.rev, eq.modId, qi);
        } else {
          recordMissCard(pr.rev, eq.key, eq.q, "FINAL EXAM — " + track.title);
        }
      });
    });
    setPhase("done");
    window.scrollTo(0, 0);
  };

  /* countdown; auto-submit at zero */
  useEffect(() => {
    if (phase !== "run") return;
    const t = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(t);
          submit(true);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, paper]);

  const answered = Object.keys(sel).length;

  /* ---------- intro ---------- */
  if (phase === "intro") {
    return (
      <div className="wrap">
        <button className="back" onClick={() => go({ v: "home" })}>
          ← BACK TO COURSE
        </button>
        <div className="authcard examcard">
          <div className="eyebrow">
            FINAL EXAM · {track.code} — {track.title.toUpperCase()}
          </div>
          <h2 className="authttl">Certification checkpoint</h2>
          <p className="authsub">
            {EXAM_LEN} questions drawn at random from a pool of {poolSize} covering every module in
            this track. {EXAM_MINUTES} minutes on the clock — it auto-submits at zero. Pass mark{" "}
            {EXAM_PASS}%. Every retake draws a fresh paper, and anything you miss goes to your
            review deck.
          </p>
          <p className="authsub">
            {best !== undefined
              ? "Best so far: " + best + "%" + (passedBest ? " — PASSED ✓" : " — not yet passed")
              : "No attempts yet."}
          </p>
          <div className="authactions">
            <button className="btn" onClick={start}>
              {best !== undefined ? "START A FRESH PAPER →" : "START THE EXAM →"}
            </button>
            <button className="btn ghost" onClick={() => go({ v: "home" })}>
              NOT YET
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- results ---------- */
  if (phase === "done") {
    const pct = lastPct ?? 0;
    const passed = pct >= EXAM_PASS;
    const right = paper.reduce((n, eq, i) => n + (sel[i] === eq.q.a ? 1 : 0), 0);
    return (
      <div className="wrap wrap-lesson">
        <button className="back" onClick={() => go({ v: "home" })}>
          ← BACK TO COURSE
        </button>
        <div className={"scoreline " + (passed ? "pass" : "fail")} role="status">
          {right}/{paper.length} — {pct}%{timedOut ? " · TIME EXPIRED" : ""}
          {passed ? " · PASSED" : " · below " + EXAM_PASS + "% — review and retake"}
        </div>

        {passed && (
          <div className="cert" role="figure" aria-label="certificate of completion">
            <div className="cert-inner">
              <div className="cert-brand">
                TUNNEL<span>CRAFT</span>
              </div>
              <div className="cert-sub">CERTIFICATE OF COMPLETION</div>
              <div className="cert-name">
                {user?.displayName || user?.email || "Field Operator"}
              </div>
              <div className="cert-line">has passed the final examination for</div>
              <div className="cert-track">
                {track.code} — {track.title}
              </div>
              <div className="cert-meta">
                SCORE {pct}% · {localDay()} · SERIAL {certCode(track, pct)}
              </div>
            </div>
          </div>
        )}

        <div className="exrow examactions">
          {passed && (
            <button className="btn" onClick={printCert}>
              ⎙ PRINT CERTIFICATE
            </button>
          )}
          <button className={"btn" + (passed ? " ghost" : "")} onClick={start}>
            {passed ? "RETAKE (FRESH PAPER)" : "RETAKE — FRESH PAPER →"}
          </button>
          <button className="btn ghost" onClick={() => go({ v: "review" })}>
            REVIEW MISSES
          </button>
        </div>

        {paper.map((eq, i) => (
          <div className="q" key={i}>
            <p className="q-q">
              <span className="qn">Q{i + 1}</span>
              {md(eq.q.q)}
            </p>
            {(optOrder[i] ?? eq.q.opts.map((_, oi) => oi)).map((oi) => {
              let cls = "opt";
              if (oi === eq.q.a) cls += " rightopt";
              if (sel[i] === oi && oi !== eq.q.a) cls += " wrongopt";
              const outcome =
                oi === eq.q.a
                  ? " (correct answer)"
                  : sel[i] === oi
                    ? " (your answer — incorrect)"
                    : "";
              return (
                <button key={oi} className={cls} disabled aria-label={eq.q.opts[oi] + outcome}>
                  {eq.q.opts[oi]}
                </button>
              );
            })}
            <p className="why">{md(eq.q.why)}</p>
          </div>
        ))}
      </div>
    );
  }

  /* ---------- running ---------- */
  const low = left <= 120;
  return (
    <div className="wrap wrap-lesson">
      <div className={"exambar" + (low ? " examlow" : "")} role="timer" aria-live="off">
        <span className="exam-t">
          {track.code} FINAL · {answered}/{paper.length} answered
        </span>
        <span className="exam-clock">{fmtClock(left)}</span>
        <button
          className="btn examsubmit"
          disabled={answered < paper.length}
          onClick={() => submit(false)}
        >
          SUBMIT
        </button>
      </div>
      {paper.map((eq, i) => (
        <div className="q" key={i}>
          <p className="q-q">
            <span className="qn">Q{i + 1}</span>
            {md(eq.q.q)}
          </p>
          {(optOrder[i] ?? eq.q.opts.map((_, oi) => oi)).map((oi) => (
            <button
              key={oi}
              className={"opt" + (sel[i] === oi ? " selopt" : "")}
              aria-pressed={sel[i] === oi}
              onClick={() => setSel({ ...sel, [i]: oi })}
            >
              {eq.q.opts[oi]}
            </button>
          ))}
        </div>
      ))}
      <div className="exrow">
        <button className="btn" disabled={answered < paper.length} onClick={() => submit(false)}>
          SUBMIT ANSWERS
        </button>
        <span className="rowlbl">
          {answered < paper.length
            ? paper.length - answered + " unanswered"
            : "all answered — submit when ready"}
        </span>
      </div>
    </div>
  );
}
