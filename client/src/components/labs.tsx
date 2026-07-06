import { useMemo, useState } from "react";
import { md } from "../lib/render";
import { shuffle, ipStr } from "./exercises";
import {
  AnswerBlock,
  HintBlock,
  RevealBtn,
  useQuestionAttempts,
  useWrongAttempts,
} from "./guidance";
import type { MissFn } from "../lib/review";
import type {
  HexExercise,
  HexQuestion,
  PcapExercise,
  Question,
  VlsmExercise,
} from "../curriculum/types";

/* ============================================================
   ARTIFACT LABS: hex decode, pcap analysis, VLSM design
   Wrong answers feed the review deck as self-contained cards.
   ============================================================ */

/* ---------- shared question list (quiz mechanics, per-lab flavor) ---------- */
interface LabQuestionsProps {
  qs: (Question | HexQuestion)[];
  done: boolean;
  onAllRight: () => void;
  onMissQ?: (qIndex: number) => void;
  onFocusQ?: (qIndex: number) => void;
}

function LabQuestions({ qs, done, onAllRight, onMissQ, onFocusQ }: LabQuestionsProps) {
  const [sel, setSel] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  const { recordWrong, level, reveal, isRevealed, clearRevealed } = useQuestionAttempts();
  const allAnswered = qs.every((_, i) => sel[i] !== undefined || isRevealed(i));
  const correctOnOwn = (i: number) => sel[i] === qs[i]!.a && !isRevealed(i);
  const right = qs.reduce((n, _, i) => n + (correctOnOwn(i) ? 1 : 0), 0);
  const allRight = checked && right === qs.length;

  const submit = () => {
    setChecked(true);
    let ok = true;
    qs.forEach((q, i) => {
      if (!correctOnOwn(i)) {
        ok = false;
        if (sel[i] !== q.a && !isRevealed(i)) {
          recordWrong(i);
          if (onMissQ) onMissQ(i);
        }
      }
    });
    if (ok) onAllRight();
  };
  const retry = () => {
    setChecked(false);
    clearRevealed();
    setSel({});
  };
  const revealQ = (i: number) => {
    reveal(i);
    setSel({ ...sel, [i]: qs[i]!.a });
    setChecked(false);
  };

  return (
    <>
      {qs.map((q, i) => {
        const qLevel = level(i);
        const revealed = isRevealed(i);
        const showQHint = !checked && qLevel !== "none" && !revealed;
        const showQReveal = !checked && qLevel === "reveal" && !revealed;
        return (
          <div className="q" key={i} onClick={() => onFocusQ && onFocusQ(i)}>
            <p className="q-q">
              <span className="qn">Q{i + 1}</span>
              {md(q.q)}
            </p>
            {q.opts.map((o, oi) => {
              let cls = "opt";
              if (!checked && sel[i] === oi) cls += " selopt";
              if ((checked || revealed) && oi === q.a) cls += " rightopt";
              if (checked && sel[i] === oi && oi !== q.a) cls += " wrongopt";
              return (
                <button
                  key={oi}
                  className={cls}
                  disabled={(checked && allRight) || revealed}
                  aria-pressed={sel[i] === oi}
                  onClick={() => {
                    setChecked(false);
                    setSel({ ...sel, [i]: oi });
                    if (onFocusQ) onFocusQ(i);
                  }}
                >
                  {o}
                </button>
              );
            })}
            {showQHint && <HintBlock>{q.why}</HintBlock>}
            {showQReveal && <RevealBtn onClick={() => revealQ(i)} />}
            {revealed && !checked && (
              <AnswerBlock>
                **{q.opts[q.a]}** — {q.why}
              </AnswerBlock>
            )}
            {checked && (
              <p className="why" role="status">
                {md(q.why)}
              </p>
            )}
          </div>
        );
      })}
      <div className="exrow">
        {allRight || done ? (
          <button className="btn okbtn">✓ DECODED</button>
        ) : (
          <button className="btn" disabled={!allAnswered} onClick={submit}>
            CHECK ANSWERS
          </button>
        )}
        {checked && !allRight && (
          <>
            <button className="btn ghost" onClick={retry}>
              ADJUST & RE-CHECK
            </button>
            <span className="verdict badv" role="alert">
              ✗ {right}/{qs.length} — wrong answers marked, adjust and re-check
            </span>
          </>
        )}
        {allRight && (
          <span className="verdict good" role="status">
            all fields read correctly
          </span>
        )}
      </div>
    </>
  );
}

/* ---------- HEX: decode an authored packet dump ---------- */
const HEX_COLS = 8;

interface HexExProps {
  ex: HexExercise;
  done: boolean;
  onDone: () => void;
  miss?: MissFn;
}

export function HexEx({ ex, done, onDone, miss }: HexExProps) {
  const bytes = useMemo(() => ex.bytes.trim().toUpperCase().split(/\s+/), [ex.id]);
  const [active, setActive] = useState(0);
  const span = ex.questions[active]?.span;

  const rows: string[][] = [];
  for (let i = 0; i < bytes.length; i += HEX_COLS) rows.push(bytes.slice(i, i + HEX_COLS));

  return (
    <div className="exwrap">
      <h3 className="ex-ttl">
        <span className={"ex-kind" + (done ? " k-done" : "")}>
          {done ? "✓ " + ex.kind : ex.kind}
        </span>
        {ex.title}
      </h3>
      <p className="ex-prompt">{md(ex.prompt)}</p>
      <div className="hexdump" aria-label="packet hex dump — offsets in hex">
        {rows.map((row, r) => (
          <div className="hexrow" key={r}>
            <span className="hexoff">{(r * HEX_COLS).toString(16).padStart(4, "0")}</span>
            {row.map((b, c) => {
              const off = r * HEX_COLS + c;
              const on = span && off >= span[0] && off < span[1];
              return (
                <span key={c} className={"hexb" + (on ? " hexon" : "")} title={"offset " + off}>
                  {b}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="rowlbl">tap a question to spotlight the bytes it asks about</div>
      <LabQuestions
        qs={ex.questions}
        done={done}
        onAllRight={onDone}
        onFocusQ={setActive}
        onMissQ={(i) => {
          const hq = ex.questions[i];
          if (miss && hq)
            miss(
              ex.id + ":" + i,
              { q: hq.q, opts: hq.opts, a: hq.a, why: hq.why },
              ex.kind + " — " + ex.title
            );
        }}
      />
      {done && ex.why && <p className="why">{md(ex.why)}</p>}
    </div>
  );
}

/* ---------- PCAP: Wireshark-style capture analysis ---------- */
interface PcapExProps {
  ex: PcapExercise;
  done: boolean;
  onDone: () => void;
  miss?: MissFn;
}

export function PcapEx({ ex, done, onDone, miss }: PcapExProps) {
  const [selRow, setSelRow] = useState<number | null>(null);
  return (
    <div className="exwrap">
      <h3 className="ex-ttl">
        <span className={"ex-kind" + (done ? " k-done" : "")}>
          {done ? "✓ " + ex.kind : ex.kind}
        </span>
        {ex.title}
      </h3>
      <p className="ex-prompt">{md(ex.prompt)}</p>
      <div className="pcapwrap" role="table" aria-label="packet capture">
        <table className="pcap">
          <thead>
            <tr>
              <th>No.</th>
              <th>Time</th>
              <th>Source</th>
              <th>Destination</th>
              <th>Proto</th>
              <th>Info</th>
            </tr>
          </thead>
          <tbody>
            {ex.packets.map((p) => (
              <tr
                key={p.no}
                className={selRow === p.no ? "pcapsel" : ""}
                onClick={() => setSelRow(selRow === p.no ? null : p.no)}
              >
                <td>{p.no}</td>
                <td>{p.time}</td>
                <td>{p.src}</td>
                <td>{p.dst}</td>
                <td>{p.proto}</td>
                <td className="pcapinfo">{p.info}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LabQuestions
        qs={ex.questions}
        done={done}
        onAllRight={onDone}
        onMissQ={(i) => {
          const q = ex.questions[i];
          if (miss && q) miss(ex.id + ":" + i, q, ex.kind + " — " + ex.title);
        }}
      />
      {done && ex.why && <p className="why">{md(ex.why)}</p>}
    </div>
  );
}

/* ---------- VLSM: infinite generated subnet-design drill ---------- */
interface VlsmRow {
  name: string;
  hosts: number;
  /** Required prefix (smallest subnet that fits `hosts`). */
  p: number;
  /** Network address under largest-first allocation from the parent base. */
  net: number;
}

export interface VlsmProblem {
  parentNet: number;
  parentP: number;
  rows: VlsmRow[];
}

const VLSM_NAMES = ["ENGINEERING", "SALES", "OPS", "VOIP", "GUESTS", "CAMERAS", "LAB", "FIELD"];

function randInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function makeVlsm(): VlsmProblem {
  const parentP = randInt(22, 24);
  // A random /parentP block inside 10.0.0.0/8, aligned to its own size.
  const blockSize = 2 ** (32 - parentP);
  const block = Math.floor(Math.random() * 2 ** (parentP - 8));
  const parentNet = ((10 << 24) >>> 0) + block * blockSize;
  // Three departments needing three distinct subnet sizes — half/quarter/eighth
  // of the parent (shifted by d), so largest-first allocation always fits and
  // every requirement has exactly one right prefix.
  const d = randInt(1, 2);
  const prefixes = [parentP + d, parentP + d + 1, parentP + d + 2];
  const names = shuffle(VLSM_NAMES).slice(0, 3);
  let cursor = parentNet;
  const rows: VlsmRow[] = prefixes.map((p, i) => {
    const cap = 2 ** (32 - p) - 2; // usable hosts in a /p
    const floor = 2 ** (31 - p) - 1; // one more than a /(p+1) can hold
    const row: VlsmRow = {
      name: names[i]!,
      hosts: randInt(floor + 1, cap),
      p,
      net: cursor,
    };
    cursor += 2 ** (32 - p);
    return row;
  });
  return { parentNet, parentP, rows };
}

interface VlsmExProps {
  ex: VlsmExercise;
  done: boolean;
  onDone: () => void;
  miss?: MissFn;
}

const key = (i: number, f: "net" | "p") => i + ":" + f;

export function VlsmEx({ ex, done, onDone, miss }: VlsmExProps) {
  const [prob, setProb] = useState<VlsmProblem>(makeVlsm);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [solved, setSolved] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const { recordWrong, reset: resetAttempts, showHint, showReveal } = useWrongAttempts();
  const allFilled = prob.rows.every(
    (_, i) => (vals[key(i, "net")] ?? "").trim() && (vals[key(i, "p")] ?? "").trim()
  );
  const vlsmHint =
    ex.why ??
    "Sort requirements by size, then hand out blocks from the top of the parent — largest subnet first, each next block aligned to its size.";

  const check = () => {
    const m: Record<string, boolean> = {};
    let ok = true;
    prob.rows.forEach((r, i) => {
      const netOk = (vals[key(i, "net")] ?? "").trim() === ipStr(r.net);
      const pOk = parseInt((vals[key(i, "p")] ?? "").trim().replace("/", ""), 10) === r.p;
      m[key(i, "net")] = netOk;
      m[key(i, "p")] = pOk;
      if (!pOk && miss) {
        const opts = shuffle([r.p, r.p - 1, r.p + 1, r.p + 2].map((p) => "/" + p));
        miss(
          "drill:vlsm:" + r.hosts,
          {
            q:
              "A subnet must fit **" +
              r.hosts +
              " hosts**. What is the smallest prefix that works?",
            opts,
            a: opts.indexOf("/" + r.p),
            why:
              "A /" +
              r.p +
              " gives 2^" +
              (32 - r.p) +
              " − 2 = " +
              (2 ** (32 - r.p) - 2) +
              " usable hosts — the smallest block ≥ " +
              r.hosts +
              ". One bit fewer halves that and no longer fits.",
          },
          "VLSM DESIGN DRILL"
        );
      }
      if (!netOk || !pOk) ok = false;
    });
    setMarks(m);
    setChecked(true);
    if (ok) {
      setSolved(solved + 1);
      if (!done) onDone();
    } else {
      recordWrong();
    }
  };

  const reveal = () => {
    const filled: Record<string, string> = {};
    prob.rows.forEach((r, i) => {
      filled[key(i, "net")] = ipStr(r.net);
      filled[key(i, "p")] = "/" + r.p;
    });
    setVals(filled);
    const m: Record<string, boolean> = {};
    prob.rows.forEach((_, i) => {
      m[key(i, "net")] = true;
      m[key(i, "p")] = true;
    });
    setMarks(m);
    setRevealed(true);
    setChecked(true);
    setSolved(solved + 1);
    if (!done) onDone();
  };

  const next = () => {
    setProb(makeVlsm());
    setVals({});
    setMarks({});
    setChecked(false);
    setRevealed(false);
    resetAttempts();
  };

  const allRight = checked && prob.rows.every((_, i) => marks[key(i, "net")] && marks[key(i, "p")]);
  const cls = (k: string) => (checked ? (marks[k] || revealed ? "rt" : "wr") : "");

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
        PARENT BLOCK: {ipStr(prob.parentNet)}/{prob.parentP}
      </div>
      <p className="rowlbl">
        Allocate largest-first from the top of the parent block. Give each department its network
        address and the smallest prefix that fits.
      </p>
      {prob.rows.map((r, i) => (
        <div className="fields vlsmrow" key={i}>
          <div className="fld vlsmreq">
            <label>department</label>
            <div className="vlsmname">
              {r.name} — {r.hosts} hosts
            </div>
          </div>
          <div className="fld">
            <label>network address</label>
            <input
              className={cls(key(i, "net"))}
              inputMode="decimal"
              placeholder="e.g. 10.64.12.0"
              value={vals[key(i, "net")] ?? ""}
              onChange={(e) => {
                if (revealed) return;
                setVals({ ...vals, [key(i, "net")]: e.target.value });
                setChecked(false);
              }}
            />
          </div>
          <div className="fld vlsmp">
            <label>prefix</label>
            <input
              className={cls(key(i, "p"))}
              inputMode="numeric"
              placeholder="/26"
              value={vals[key(i, "p")] ?? ""}
              onChange={(e) => {
                if (revealed) return;
                setVals({ ...vals, [key(i, "p")]: e.target.value });
                setChecked(false);
              }}
            />
          </div>
        </div>
      ))}
      <div className="exrow">
        <button className="btn" disabled={!allFilled} onClick={check}>
          CHECK DESIGN
        </button>
        <button className="btn ghost" onClick={next}>
          NEW SCENARIO
        </button>
        {allRight && (
          <span className="verdict good" role="status">
            ✓ clean allocation — {solved} solved this session
          </span>
        )}
        {checked && !allRight && !revealed && (
          <span className="verdict badv" role="alert">
            ✗ red fields are wrong — remember: biggest subnet first, each block aligned to its size
          </span>
        )}
        {showReveal && checked && !allRight && !revealed && <RevealBtn onClick={reveal} />}
      </div>
      {showHint && checked && !allRight && !revealed && <HintBlock>{vlsmHint}</HintBlock>}
      {revealed && (
        <AnswerBlock>
          {prob.rows.map((r) => r.name + ": **" + ipStr(r.net) + "/" + r.p + "**").join("\n\n")}
        </AnswerBlock>
      )}
      {allRight && (
        <p className="why">
          Sort requirements by size, then hand out blocks from the top: the largest subnet takes the
          parent's base address, and each next block starts where the previous one ended — which is
          automatically aligned because sizes descend in powers of two.
          {ex.why ? " " : ""}
          {ex.why ? md(ex.why) : null}
        </p>
      )}
    </div>
  );
}
