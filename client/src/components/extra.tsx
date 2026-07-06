import { useMemo, useState } from "react";
import { md } from "../lib/render";
import { shuffle } from "./exercises";
import { AnswerBlock, HintBlock, RevealBtn, useWrongAttempts } from "./guidance";
import { PORTS } from "../curriculum/tracks";
import type { PortEntry } from "../curriculum/tracks";
import type { MissFn } from "../lib/review";
import type { MatchExercise, PortsExercise } from "../curriculum/types";

/* ---------- MATCH: term → definition via shuffled selects ---------- */
interface MatchExProps {
  ex: MatchExercise;
  done: boolean;
  onDone: () => void;
}

export function MatchEx({ ex, done, onDone }: MatchExProps) {
  const defs = useMemo(() => shuffle(ex.pairs.map((p) => p.d)), [ex.id]);
  const [sel, setSel] = useState<string[]>(() => ex.pairs.map(() => ""));
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const { recordWrong, reset: resetAttempts, showHint, showReveal } = useWrongAttempts();
  const allPicked = sel.every((s) => s !== "");
  const results: boolean[] | null = checked ? ex.pairs.map((p, i) => sel[i] === p.d) : null;
  const allRight = results !== null && results.every(Boolean);

  const reveal = () => {
    setSel(ex.pairs.map((p) => p.d));
    setRevealed(true);
    setChecked(true);
    onDone();
  };
  const retry = () => {
    setSel(ex.pairs.map(() => ""));
    setChecked(false);
    setRevealed(false);
    resetAttempts();
  };

  return (
    <div className="exwrap">
      <div className="ex-kind">{ex.kind}</div>
      <div className="ex-ttl">{ex.title}</div>
      <p className="ex-prompt">{md(ex.prompt)}</p>
      <div className="matchgrid">
        {ex.pairs.map((p, i) => (
          <div className="matchrow" key={i}>
            <div className="matchterm">{p.t}</div>
            <select
              className={"matchsel" + (results ? (results[i] ? " rightsel" : " wrongsel") : "")}
              value={sel[i]}
              disabled={done || revealed}
              onChange={(e) => {
                setChecked(false);
                setSel(sel.map((s, j) => (j === i ? e.target.value : s)));
              }}
            >
              <option value="">— pick the definition —</option>
              {defs.map((d, j) => (
                <option key={j} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {done ? (
        <div className="verdict good" role="status">
          ✓ LAB COMPLETE
        </div>
      ) : checked && allRight ? (
        <>
          <div className="verdict good" role="status">
            ✓ ALL MATCHED
          </div>
          <p className="why">{md(ex.why ?? "")}</p>
          <button className="btn" onClick={onDone}>
            MARK LAB COMPLETE
          </button>
        </>
      ) : (
        <>
          {checked && results && !allRight && !revealed && (
            <div className="verdict badv" role="alert">
              ✗ {results.filter(Boolean).length}/{ex.pairs.length} correct — wrong rows marked,
              adjust and re-check
            </div>
          )}
          {showHint && checked && !allRight && !revealed && (
            <HintBlock>
              {ex.why ??
                "Each term maps to exactly one definition — eliminate options that describe a different layer or protocol."}
            </HintBlock>
          )}
          {showReveal && checked && !allRight && !revealed && <RevealBtn onClick={reveal} />}
          {revealed && (
            <AnswerBlock>
              {ex.pairs.map((p) => "**" + p.t + "** → " + p.d).join("\n\n")}
            </AnswerBlock>
          )}
          {!revealed && (
            <>
              {checked && !allRight && (
                <button className="btn ghost" onClick={retry}>
                  CLEAR & RETRY
                </button>
              )}
              <button
                className="btn"
                disabled={!allPicked}
                onClick={() => {
                  setChecked(true);
                  const ok = ex.pairs.every((p, i) => sel[i] === p.d);
                  if (!ok) recordWrong();
                }}
              >
                CHECK MATCHES
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- PORTS: infinite service → port-number drill ---------- */
function pickPort(excludeSvc: string | null): PortEntry {
  const pool = PORTS.filter((p) => p.svc !== excludeSvc);
  // PORTS holds 20 well-known services; excluding one still leaves a non-empty pool
  return pool[Math.floor(Math.random() * pool.length)]!;
}

interface PortDrillProps {
  ex: PortsExercise;
  done: boolean;
  onDone: () => void;
  miss?: MissFn;
}

export function PortDrill({ ex, done, onDone, miss }: PortDrillProps) {
  const [prob, setProb] = useState<PortEntry>(() => pickPort(null));
  const [val, setVal] = useState("");
  const [state, setState] = useState<"ask" | "right" | "wrong">("ask");
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const { recordWrong, reset: resetAttempts, showHint, showReveal } = useWrongAttempts();

  const check = () => {
    const ok = parseInt(val.trim(), 10) === prob.port;
    setState(ok ? "right" : "wrong");
    const s = ok ? streak + 1 : 0;
    setStreak(s);
    if (s > best) setBest(s);
    if (!ok) {
      recordWrong();
      if (miss) {
        const correct = String(prob.port);
        const others = shuffle(PORTS.filter((p) => p.port !== prob.port))
          .slice(0, 3)
          .map((p) => String(p.port));
        const opts = shuffle([correct, ...others]);
        miss(
          "drill:port:" + prob.port,
          {
            q: "Which default port does **" + prob.svc + "** use?",
            opts,
            a: opts.indexOf(correct),
            why: prob.svc + " listens on port " + prob.port + " by default.",
          },
          "PORT DRILL"
        );
      }
    }
    if (ok && !done) onDone();
  };
  const reveal = () => {
    setVal(String(prob.port));
    setRevealed(true);
    setState("right");
    if (!done) onDone();
  };
  const next = () => {
    setProb(pickPort(prob.svc));
    setVal("");
    setState("ask");
    setRevealed(false);
    resetAttempts();
  };

  return (
    <div className="exwrap">
      <div className="ex-kind">{ex.kind}</div>
      <div className="ex-ttl">{ex.title}</div>
      <p className="ex-prompt">{md(ex.prompt)}</p>
      <div className="probline">
        SERVICE: <strong>{prob.svc}</strong>
      </div>
      <div className="fields" style={{ gridTemplateColumns: "minmax(140px,220px)" }}>
        <div className="fld">
          <label>port number</label>
          <input
            value={val}
            inputMode="numeric"
            autoComplete="off"
            className={state === "wrong" ? "wr" : state === "right" ? "rt" : ""}
            onChange={(e) => {
              if (revealed) return;
              setVal(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (state === "right") next();
                else if (val.trim()) check();
              }
            }}
          />
        </div>
      </div>
      {state === "right" && (
        <div className="verdict good" role="status">
          ✓ {prob.svc} = {prob.port} — streak {streak}
          {revealed ? " (revealed)" : ""}
        </div>
      )}
      {state === "wrong" && !revealed && (
        <div className="verdict badv" role="alert">
          ✗ not quite — try again
        </div>
      )}
      {showHint && state === "wrong" && !revealed && (
        <HintBlock>
          Well-known ports below 1024 follow familiar patterns — HTTP is 80, HTTPS 443, DNS is 53.
          Think about what protocol **{prob.svc}** uses.
        </HintBlock>
      )}
      {showReveal && state === "wrong" && !revealed && <RevealBtn onClick={reveal} />}
      {revealed && (
        <AnswerBlock>
          **{prob.svc}** listens on port **{prob.port}** by default.
        </AnswerBlock>
      )}
      <div className="scoreline">
        streak {streak} · best {best}
        {done ? " · ✓ drill logged" : " · first correct answer logs this lab"}
      </div>
      <div className="exrow" style={{ marginTop: 10 }}>
        {(state === "ask" || state === "wrong") && !revealed && (
          <button className="btn" disabled={!val.trim()} onClick={check}>
            CHECK
          </button>
        )}
        {state === "right" && (
          <button className="btn ghost" onClick={next}>
            NEXT SERVICE →
          </button>
        )}
      </div>
    </div>
  );
}
