import { useState } from "react";
import { md, hl } from "../lib/render";
import type {
  BlankExercise,
  CheckExercise,
  CidrExercise,
  Module,
  OrderExercise,
} from "../curriculum/types";

/* ============================================================
   INTERACTIVE COMPONENTS
   ============================================================ */

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // i and j are always in range, so neither read is undefined
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

/* ----- ORDER exercise: tap tokens into sequence ----- */
interface OrderExProps {
  ex: OrderExercise;
  done: boolean;
  onDone: () => void;
}

export function OrderEx({ ex, done, onDone }: OrderExProps) {
  const [pool, setPool] = useState<string[]>(() => {
    let s = shuffle(ex.items);
    if (s.join("|") === ex.items.join("|")) s = shuffle(ex.items);
    return s;
  });
  const [picked, setPicked] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "wrong" | "done">(done ? "done" : "idle");

  const pick = (t: string) => {
    if (state === "done") return;
    setPool(pool.filter((x) => x !== t));
    setPicked([...picked, t]);
    setState("idle");
  };
  const unpick = (t: string) => {
    if (state === "done") return;
    setPicked(picked.filter((x) => x !== t));
    setPool([...pool, t]);
    setState("idle");
  };
  const check = () => {
    if (picked.join("|") === ex.items.join("|")) {
      setState("done");
      onDone();
    } else setState("wrong");
  };
  const reset = () => {
    setPool(shuffle(ex.items));
    setPicked([]);
    setState("idle");
  };

  return (
    <div className="exwrap">
      <h3 className="ex-ttl">
        <span className={"ex-kind" + (done ? " k-done" : "")}>
          {done ? "✓ " + ex.kind : ex.kind}
        </span>
        {ex.title}
      </h3>
      <p className="ex-prompt">{md(ex.prompt)}</p>
      <div className="rowlbl">Your sequence — tap to remove</div>
      <div className="tokrow picked-row">
        {picked.map((t, i) => (
          <button
            key={t}
            className="tok"
            aria-label={"Step " + (i + 1) + " of your sequence: " + t + ". Activate to remove it."}
            onClick={() => unpick(t)}
          >
            <span className="n" aria-hidden="true">
              {i + 1}
            </span>
            {t}
          </button>
        ))}
        {picked.length === 0 && (
          <span style={{ color: "var(--dim)", fontSize: 12, padding: 4 }}>
            tap steps below, in order…
          </span>
        )}
      </div>
      <div className="rowlbl">Available steps</div>
      <div className="tokrow">
        {pool.map((t) => (
          <button
            key={t}
            className="tok"
            aria-label={
              "Available step: " + t + ". Activate to add it as the next step in your sequence."
            }
            onClick={() => pick(t)}
          >
            {t}
          </button>
        ))}
        {pool.length === 0 && (
          <span style={{ color: "var(--dim)", fontSize: 12, padding: 4 }}>all placed</span>
        )}
      </div>
      <div className="exrow">
        {state !== "done" && (
          <button className="btn" disabled={pool.length > 0} onClick={check}>
            CHECK ORDER
          </button>
        )}
        {state === "done" && <button className="btn okbtn">✓ CORRECT</button>}
        <button className="btn ghost" onClick={reset}>
          SHUFFLE & RETRY
        </button>
        {state === "wrong" && (
          <span className="verdict badv" role="alert">
            ✗ not quite — reorder and try again
          </span>
        )}
        {state === "done" && (
          <span className="verdict good" role="status">
            sequence locked in
          </span>
        )}
      </div>
      {state === "done" && ex.why && <p className="why">{md(ex.why)}</p>}
    </div>
  );
}

/* ----- BLANK exercise: dropdowns inside highlighted code ----- */
interface BlankExProps {
  ex: BlankExercise;
  done: boolean;
  onDone: () => void;
}

export function BlankEx({ ex, done, onDone }: BlankExProps) {
  const [sel, setSel] = useState<Record<number, number>>({});
  const [state, setState] = useState<"idle" | "wrong" | "done">(done ? "done" : "idle");

  const parts = ex.code.split(/§(\d)§/); // even idx: code text, odd idx: blank number
  const allChosen = ex.blanks.every((_, i) => sel[i] !== undefined);
  const check = () => {
    const ok = ex.blanks.every((b, i) => sel[i] === b.a);
    if (ok) {
      setState("done");
      onDone();
    } else setState("wrong");
  };

  return (
    <div className="exwrap">
      <h3 className="ex-ttl">
        <span className={"ex-kind" + (done ? " k-done" : "")}>
          {done ? "✓ " + ex.kind : ex.kind}
        </span>
        {ex.title}
      </h3>
      <p className="ex-prompt">{md(ex.prompt)}</p>
      <div className="cb">
        <div className="cb-lang">rust — fill the blanks</div>
        <pre>
          <code>
            {parts.map((seg, i) => {
              if (i % 2 === 0) return <span key={i}>{hl(seg, "rust")}</span>;
              const bi = parseInt(seg, 10);
              const b = ex.blanks[bi];
              if (b === undefined) return null; // §n§ markers always index into blanks
              const cls =
                "blanksel" +
                (state === "wrong" && sel[bi] !== undefined && sel[bi] !== b.a ? " wrongsel" : "") +
                (state === "done" ? " rightsel" : "");
              return (
                <select
                  key={i}
                  className={cls}
                  value={sel[bi] === undefined ? "" : sel[bi]}
                  disabled={state === "done"}
                  onChange={(e) => {
                    setSel({ ...sel, [bi]: parseInt(e.target.value, 10) });
                    setState("idle");
                  }}
                >
                  <option value="" disabled>
                    ____
                  </option>
                  {b.opts.map((o, oi) => (
                    <option key={oi} value={oi}>
                      {o}
                    </option>
                  ))}
                </select>
              );
            })}
          </code>
        </pre>
      </div>
      <div className="exrow">
        {state !== "done" && (
          <button className="btn" disabled={!allChosen} onClick={check}>
            CHECK CODE
          </button>
        )}
        {state === "done" && <button className="btn okbtn">✓ COMPILES (SPIRITUALLY)</button>}
        {state === "wrong" && (
          <span className="verdict badv" role="alert">
            ✗ wrong choice highlighted — reconsider
          </span>
        )}
        {state === "done" && (
          <span className="verdict good" role="status">
            exactly right
          </span>
        )}
      </div>
      {state === "done" && ex.why && <p className="why">{md(ex.why)}</p>}
    </div>
  );
}

/* ----- CIDR live trainer ----- */
export function ipStr(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export interface CidrProblem {
  ip: string;
  p: number;
  net: string;
  bc: string;
  hosts: number;
}

export function makeProb(): CidrProblem {
  const p = 22 + Math.floor(Math.random() * 8); // /22 .. /29
  const bases: [number, number, number, number][] = [
    [10, Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), 0],
    [172, 16 + Math.floor(Math.random() * 16), Math.floor(Math.random() * 256), 0],
    [192, 168, Math.floor(Math.random() * 256), 0],
  ];
  // Math.random() < 1, so the index is always in range
  const b = bases[Math.floor(Math.random() * bases.length)]!;
  const ip = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | Math.floor(Math.random() * 256)) >>> 0;
  const mask = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
  const net = (ip & mask) >>> 0;
  const bc = (net | (~mask >>> 0)) >>> 0;
  const hosts = Math.pow(2, 32 - p) - 2;
  return { ip: ipStr(ip), p, net: ipStr(net), bc: ipStr(bc), hosts };
}

interface CidrTrainerProps {
  ex: CidrExercise;
  done: boolean;
  onDone: () => void;
}

type CidrField = "net" | "bc" | "hosts";

export function CidrTrainer({ ex, done, onDone }: CidrTrainerProps) {
  const [prob, setProb] = useState<CidrProblem>(makeProb);
  const [vals, setVals] = useState<Record<CidrField, string>>({ net: "", bc: "", hosts: "" });
  const [state, setState] = useState<"idle" | "checked">("idle");
  const [marks, setMarks] = useState<Partial<Record<CidrField, boolean>>>({});
  const [solved, setSolved] = useState(0);

  const check = () => {
    const m = {
      net: vals.net.trim() === prob.net,
      bc: vals.bc.trim() === prob.bc,
      hosts: parseInt(vals.hosts.trim(), 10) === prob.hosts,
    };
    setMarks(m);
    setState("checked");
    if (m.net && m.bc && m.hosts) {
      setSolved(solved + 1);
      if (!done) onDone();
    }
  };
  const next = () => {
    setProb(makeProb());
    setVals({ net: "", bc: "", hosts: "" });
    setMarks({});
    setState("idle");
  };
  const allRight = state === "checked" && marks.net && marks.bc && marks.hosts;
  const fldCls = (k: CidrField) => (state === "checked" ? (marks[k] ? "rt" : "wr") : "");

  return (
    <div className="exwrap">
      <h3 className="ex-ttl">
        <span className={"ex-kind" + (done ? " k-done" : "")}>
          {done ? "✓ " + ex.kind : ex.kind}
        </span>
        {ex.title}
      </h3>
      <p className="ex-prompt">{md(ex.prompt)}</p>
      <div className="probline">
        {prob.ip}/{prob.p}
      </div>
      <div className="fields">
        <div className="fld">
          <label>Network address</label>
          <input
            className={fldCls("net")}
            inputMode="decimal"
            placeholder="e.g. 10.4.0.0"
            value={vals.net}
            onChange={(e) => {
              setVals({ ...vals, net: e.target.value });
              setState("idle");
            }}
          />
        </div>
        <div className="fld">
          <label>Broadcast address</label>
          <input
            className={fldCls("bc")}
            inputMode="decimal"
            placeholder="e.g. 10.4.3.255"
            value={vals.bc}
            onChange={(e) => {
              setVals({ ...vals, bc: e.target.value });
              setState("idle");
            }}
          />
        </div>
        <div className="fld">
          <label>Usable hosts</label>
          <input
            className={fldCls("hosts")}
            inputMode="numeric"
            placeholder="e.g. 1022"
            value={vals.hosts}
            onChange={(e) => {
              setVals({ ...vals, hosts: e.target.value });
              setState("idle");
            }}
          />
        </div>
      </div>
      <div className="exrow">
        <button className="btn" onClick={check}>
          CHECK
        </button>
        <button className="btn ghost" onClick={next}>
          NEW PROBLEM
        </button>
        {allRight && (
          <span className="verdict good" role="status">
            ✓ correct — {solved} solved this session
          </span>
        )}
        {state === "checked" && !allRight && (
          <span className="verdict badv" role="alert">
            ✗ red fields are wrong
          </span>
        )}
      </div>
      {allRight && (
        <p className="why">
          /{prob.p} ⇒ mask keeps the top {prob.p} bits. Network = IP AND mask = {prob.net};
          broadcast = network OR inverted mask = {prob.bc}; usable = 2^{32 - prob.p} − 2 ={" "}
          {prob.hosts} (network & broadcast excluded).
        </p>
      )}
    </div>
  );
}

/* ----- CAPSTONE checklist ----- */
interface ChecklistProps {
  ex: CheckExercise;
  cap: Record<string, boolean>;
  onToggle: (ex: CheckExercise, i: number) => void;
  done: boolean;
}

export function Checklist({ ex, cap, onToggle, done }: ChecklistProps) {
  const doneCount = ex.items.filter((_, i) => cap[ex.id + ":" + i]).length;
  return (
    <div className="exwrap">
      <h3 className="ex-ttl">
        <span className={"ex-kind" + (done ? " k-done" : "")}>
          {done ? "✓ " + ex.kind : ex.kind}
        </span>
        {ex.title}
      </h3>
      <p className="ex-prompt">{md(ex.prompt)}</p>
      <div className="rowlbl">
        {doneCount} / {ex.items.length} rungs climbed
      </div>
      {ex.items.map((it, i) => {
        const on = !!cap[ex.id + ":" + i];
        return (
          <button key={i} className={"ck" + (on ? " ckon" : "")} onClick={() => onToggle(ex, i)}>
            <span className="box">{on ? "✓" : ""}</span>
            <span className="ck-t">
              <b>R{i + 1}</b>
              {it}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ----- QUIZ ----- */
interface QuizProps {
  mod: Module;
  best: number | undefined;
  onScore: (pct: number) => void;
  onMiss?: (modId: string, qIndex: number) => void;
}

export function Quiz({ mod, best, onScore, onMiss }: QuizProps) {
  const qs = mod.quiz?.questions ?? []; // only rendered for modules with a quiz
  const [sel, setSel] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = qs.every((_, i) => sel[i] !== undefined);
  const score = qs.reduce((s, q, i) => s + (sel[i] === q.a ? 1 : 0), 0);
  const pct = Math.round((score / qs.length) * 100);
  const passed = pct >= 70;
  const passedBest = best !== undefined && best >= 70;

  const submit = () => {
    setSubmitted(true);
    onScore(pct);
    if (onMiss)
      qs.forEach((q, i) => {
        if (sel[i] !== q.a) onMiss(mod.id, i);
      });
  };
  const retake = () => {
    setSel({});
    setSubmitted(false);
  };

  return (
    <div className="exwrap">
      <h3 className="ex-ttl">
        <span className={"ex-kind" + (passedBest ? " k-done" : "")}>
          {passedBest ? "✓ PASSED" : "CHECKPOINT"}
        </span>
        {mod.code} knowledge check
      </h3>
      <p className="ex-prompt">
        Pass mark 70%. {best !== undefined ? "Best so far: " + best + "%." : "No attempts yet."}
      </p>
      {submitted && (
        <div className={"scoreline " + (passed ? "pass" : "fail")} role="status" aria-live="polite">
          {score}/{qs.length} — {pct}% {passed ? "· PASSED" : "· below 70, review and retake"}
        </div>
      )}
      {qs.map((q, i) => (
        <div className="q" key={i}>
          <p className="q-q">
            <span className="qn">Q{i + 1}</span>
            {md(q.q)}
          </p>
          {q.opts.map((o, oi) => {
            let cls = "opt";
            if (!submitted && sel[i] === oi) cls += " selopt";
            if (submitted && oi === q.a) cls += " rightopt";
            if (submitted && sel[i] === oi && oi !== q.a) cls += " wrongopt";
            const outcome = !submitted
              ? ""
              : oi === q.a
                ? " (correct answer)"
                : sel[i] === oi
                  ? " (your answer — incorrect)"
                  : "";
            return (
              <button
                key={oi}
                className={cls}
                disabled={submitted}
                aria-pressed={sel[i] === oi}
                aria-label={o + outcome}
                onClick={() => setSel({ ...sel, [i]: oi })}
              >
                {o}
              </button>
            );
          })}
          {submitted && (
            <p className="why" role="status">
              {md(q.why)}
            </p>
          )}
        </div>
      ))}
      <div className="exrow">
        {!submitted && (
          <button className="btn" disabled={!allAnswered} onClick={submit}>
            SUBMIT ANSWERS
          </button>
        )}
        {submitted && (
          <button className="btn ghost" onClick={retake}>
            RETAKE
          </button>
        )}
      </div>
    </div>
  );
}
