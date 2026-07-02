import { useMemo, useState } from "react";
import { md } from "../lib/render";
import { shuffle } from "./exercises";
import { PORTS } from "../curriculum/tracks";
import type { PortEntry } from "../curriculum/tracks";
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
  const allPicked = sel.every((s) => s !== "");
  const results: boolean[] | null = checked ? ex.pairs.map((p, i) => sel[i] === p.d) : null;
  const allRight = results !== null && results.every(Boolean);

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
              disabled={done}
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
          {checked && results && !allRight && (
            <div className="verdict badv" role="alert">
              ✗ {results.filter(Boolean).length}/{ex.pairs.length} correct — wrong rows marked,
              adjust and re-check
            </div>
          )}
          <button className="btn" disabled={!allPicked} onClick={() => setChecked(true)}>
            CHECK MATCHES
          </button>
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
}

export function PortDrill({ ex, done, onDone }: PortDrillProps) {
  const [prob, setProb] = useState<PortEntry>(() => pickPort(null));
  const [val, setVal] = useState("");
  const [state, setState] = useState<"ask" | "right" | "wrong">("ask");
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);

  const check = () => {
    const ok = parseInt(val.trim(), 10) === prob.port;
    setState(ok ? "right" : "wrong");
    const s = ok ? streak + 1 : 0;
    setStreak(s);
    if (s > best) setBest(s);
    if (ok && !done) onDone();
  };
  const next = () => {
    setProb(pickPort(prob.svc));
    setVal("");
    setState("ask");
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
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (state === "ask") check();
                else next();
              }
            }}
          />
        </div>
      </div>
      {state === "right" && (
        <div className="verdict good" role="status">
          ✓ {prob.svc} = {prob.port} — streak {streak}
        </div>
      )}
      {state === "wrong" && (
        <div className="verdict badv" role="alert">
          ✗ {prob.svc} is port {prob.port}
        </div>
      )}
      <div className="scoreline">
        streak {streak} · best {best}
        {done ? " · ✓ drill logged" : " · first correct answer logs this lab"}
      </div>
      <div style={{ marginTop: 10 }}>
        {state === "ask" ? (
          <button className="btn" disabled={!val.trim()} onClick={check}>
            CHECK
          </button>
        ) : (
          <button className="btn ghost" onClick={next}>
            NEXT SERVICE →
          </button>
        )}
      </div>
    </div>
  );
}
