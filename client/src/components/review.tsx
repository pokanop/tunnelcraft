import { useMemo, useState } from "react";
import { md } from "../lib/render";
import { shuffle } from "./exercises";
import { dueCards, deckStats, resolveCard, BOX_INTERVALS_DAYS } from "../lib/review";
import type { Module } from "../curriculum/types";
import type { Progress } from "../lib/progress";
import type { Route } from "../App";

/* Review mode: drills every due card (missed quiz questions) with
   Leitner scheduling. Right → promotes toward graduation; wrong → box 0. */
interface ReviewViewProps {
  byId: Record<string, Module>;
  prog: Progress;
  onAnswer: (key: string, correct: boolean) => void;
  go: (r: Route) => void;
}

export function ReviewView({ byId, prog, onAnswer, go }: ReviewViewProps) {
  const [queue, setQueue] = useState<string[]>(() => dueCards(prog.rev));
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [session, setSession] = useState({ right: 0, wrong: 0 });

  const stats = deckStats(prog.rev);
  const key = queue[idx];
  const card = key !== undefined ? resolveCard(byId, key, prog.rev[key]) : null;
  // Stable option shuffle per card so the answer isn't always in the same slot
  const order = useMemo(() => (card ? shuffle(card.q.opts.map((_, i) => i)) : []), [key]);

  const answer = (oi: number) => {
    if (answered || key === undefined || !card) return;
    const correct = oi === card.q.a;
    setSel(oi);
    setAnswered(true);
    setSession((s) => ({ right: s.right + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1) }));
    onAnswer(key, correct);
  };
  const next = () => {
    setIdx(idx + 1);
    setSel(null);
    setAnswered(false);
  };

  if (stats.total === 0) {
    return (
      <div className="wrap">
        <button className="back" onClick={() => go({ v: "home" })}>
          ← BACK TO COURSE
        </button>
        <div className="authcard">
          <div className="eyebrow">REVIEW DECK</div>
          <h2 className="authttl">Nothing to review</h2>
          <p className="authsub">
            Miss a quiz question, a drill answer, or a final-exam question anywhere in the course
            and it becomes a review card here. Cards come back on a spaced schedule (
            {BOX_INTERVALS_DAYS.slice(1).join(", ")} days) until you've answered each one right{" "}
            {BOX_INTERVALS_DAYS.length - 1} times in a row — then they graduate. Wrong answers start
            the ladder over.
          </p>
        </div>
      </div>
    );
  }

  if (key === undefined || !card || idx >= queue.length) {
    const remaining = dueCards(prog.rev).length;
    return (
      <div className="wrap">
        <button className="back" onClick={() => go({ v: "home" })}>
          ← BACK TO COURSE
        </button>
        <div className="authcard">
          <div className="eyebrow">REVIEW DECK</div>
          <h2 className="authttl">{queue.length ? "Session complete" : "All caught up"}</h2>
          {queue.length > 0 && (
            <p className="authsub">
              {session.right} right · {session.wrong} wrong this session.
              {session.wrong > 0
                ? " Missed cards reset to box 0 and are due again now — run another pass to clear them."
                : " Every card advanced a box."}
            </p>
          )}
          <p className="authsub">
            Deck: {stats.total} cards ({stats.learning} learning, {stats.maturing} maturing) ·{" "}
            {remaining} due now.
          </p>
          <div className="authactions">
            {remaining > 0 && (
              <button
                className="btn"
                onClick={() => {
                  setQueue(dueCards(prog.rev));
                  setIdx(0);
                  setSession({ right: 0, wrong: 0 });
                }}
              >
                REVIEW {remaining} DUE →
              </button>
            )}
            <button className="btn ghost" onClick={() => go({ v: "home" })}>
              BACK TO COURSE
            </button>
          </div>
        </div>
      </div>
    );
  }

  const c = prog.rev[key];
  return (
    <div className="wrap">
      <button className="back" onClick={() => go({ v: "home" })}>
        ← exit review
      </button>
      <div className="revhead">
        <span className="ex-kind">
          REVIEW · {idx + 1}/{queue.length}
        </span>
        <span className="rev-src">{card.src}</span>
        <span className="rev-box">
          box {c ? c.box : 0}/{BOX_INTERVALS_DAYS.length - 1}
          {c && c.misses > 1 ? " · missed ×" + c.misses : ""}
        </span>
      </div>
      <div className="exwrap">
        <div className="q">
          <p className="q-q">{md(card.q.q)}</p>
          {order.map((oi) => {
            let cls = "opt";
            if (answered && oi === card.q.a) cls += " rightopt";
            if (answered && sel === oi && oi !== card.q.a) cls += " wrongopt";
            return (
              <button key={oi} className={cls} disabled={answered} onClick={() => answer(oi)}>
                {card.q.opts[oi]}
              </button>
            );
          })}
          {answered && <p className="why">{md(card.q.why)}</p>}
        </div>
        {answered && (
          <div className="exrow">
            <button className="btn" onClick={next}>
              {idx + 1 < queue.length ? "NEXT CARD →" : "FINISH SESSION"}
            </button>
            {card.mod && (
              <button
                className="btn ghost"
                onClick={() => card.mod && go({ v: "mod", id: card.mod.id })}
              >
                REVISIT {card.mod.code}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
