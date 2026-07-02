/* TunnelCraft diagram engine — typed, declarative, rendered as themed SVG.
   Every color is a CSS variable, so diagrams follow light/dark automatically
   and print cleanly. No dependencies; layout is computed from label widths
   using the monospace metric (IBM Plex Mono).

   Six diagram kinds cover the curriculum:
     packet — encapsulation / header layouts (nested boxes)
     seq    — sequence diagrams (handshakes, DORA, DNS resolution…)
     flow   — left-to-right pipelines with labeled arrows
     topo   — small network topologies on a grid
     stack  — layer stacks side by side (OSI, tunnel stacks…)
     state  — state machines (TCP, DHCP lease, WG handshake…)
*/
import type { ReactNode } from "react";

/* ---------- tones map to the app palette ---------- */
export type Tone =
  | "default"
  | "acc"
  | "acc2"
  | "ok"
  | "bad"
  | "dim"
  | "l1"
  | "l2"
  | "l3"
  | "l4"
  | "l5"
  | "l6"
  | "l7";

const TONE_VAR: Record<Tone, string> = {
  default: "var(--mut)",
  acc: "var(--acc)",
  acc2: "var(--acc2)",
  ok: "var(--ok)",
  bad: "var(--bad)",
  dim: "var(--dim)",
  l1: "var(--l1)",
  l2: "var(--l2)",
  l3: "var(--l3)",
  l4: "var(--l4)",
  l5: "var(--l5)",
  l6: "var(--l6)",
  l7: "var(--l7)",
};

const tone = (t?: Tone): string => TONE_VAR[t ?? "default"];
/** Translucent fill derived from a tone (keeps boxes subtle in both themes). */
const toneFill = (t?: Tone, pct = 14): string =>
  t && t !== "default"
    ? `color-mix(in srgb, ${TONE_VAR[t]} ${pct}%, transparent)`
    : "var(--panel2)";
const toneLine = (t?: Tone): string =>
  t && t !== "default" ? `color-mix(in srgb, ${TONE_VAR[t]} 55%, transparent)` : "var(--line)";

/* ---------- spec types ---------- */
export interface PacketSeg {
  label: string;
  sub?: string;
  tone?: Tone;
  /** Nested payload (one level) — renders inside this segment. */
  inner?: PacketSeg[];
}

export interface SeqActor {
  id: string;
  label: string;
  sub?: string;
  tone?: Tone;
}
export type SeqStep =
  | { from: string; to: string; label: string; sub?: string; tone?: Tone; dashed?: boolean }
  | { note: string; tone?: Tone };

export interface FlowNode {
  label: string;
  sub?: string;
  tone?: Tone;
}

export interface TopoNode {
  id: string;
  label: string;
  sub?: string;
  tone?: Tone;
  /** Grid coordinates: columns and rows, 0-based. */
  x: number;
  y: number;
  shape?: "box" | "round" | "cloud";
}
export interface TopoLink {
  from: string;
  to: string;
  label?: string;
  tone?: Tone;
  dashed?: boolean;
}

export interface StackCol {
  title: string;
  cells: { label: string; sub?: string; tone?: Tone }[];
}

export interface StateNode {
  id: string;
  label: string;
  tone?: Tone;
  x: number;
  y: number;
}
export interface StateEdge {
  from: string;
  to: string;
  label?: string;
  tone?: Tone;
  dashed?: boolean;
  /** Perpendicular bend, in px; use to separate parallel edges. */
  bend?: number;
}

export type Diagram =
  | { kind: "packet"; title?: string; caption?: string; segs: PacketSeg[] }
  | { kind: "seq"; title?: string; caption?: string; actors: SeqActor[]; steps: SeqStep[] }
  | { kind: "flow"; title?: string; caption?: string; nodes: FlowNode[]; arrows?: string[] }
  | { kind: "topo"; title?: string; caption?: string; nodes: TopoNode[]; links: TopoLink[] }
  | { kind: "stack"; title?: string; caption?: string; cols: StackCol[]; gapLabel?: string }
  | { kind: "state"; title?: string; caption?: string; states: StateNode[]; edges: StateEdge[] };

/* ---------- text metrics (IBM Plex Mono) ---------- */
const CW = 7.3; // px per character at 12px
const CW_SUB = 6.1; // px per character at 10px
const tw = (s: string): number => s.length * CW;
const tws = (s: string): number => s.length * CW_SUB;

let uid = 0;

/* ---------- shared primitives ---------- */
function Arrow({ id, color }: { id: string; color: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth="7"
      markerHeight="7"
      orient="auto-start-reverse"
    >
      <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
    </marker>
  );
}

function Frame({
  kind,
  title,
  caption,
  w,
  h,
  children,
}: {
  kind: string;
  title?: string | undefined;
  caption?: string | undefined;
  w: number;
  h: number;
  children: ReactNode;
}) {
  return (
    <figure className="dgm">
      <div className="dgm-head">
        <span className="dgm-kind">{kind}</span>
        {title && <span className="dgm-title">{title}</span>}
      </div>
      <div className="dgm-scroll">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          width="100%"
          style={{ maxWidth: w, minWidth: Math.min(w, 520), display: "block" }}
          role="img"
          aria-label={title ? `Diagram: ${title}` : "Diagram"}
        >
          {children}
        </svg>
      </div>
      {caption && <figcaption className="dgm-cap">{caption}</figcaption>}
    </figure>
  );
}

function boxText(
  cx: number,
  cy: number,
  label: string,
  sub: string | undefined,
  color: string,
  key?: string | number
): ReactNode {
  return (
    <g key={key}>
      <text
        x={cx}
        y={sub ? cy - 4 : cy}
        textAnchor="middle"
        dominantBaseline="central"
        className="dgm-t"
        fill={color}
      >
        {label}
      </text>
      {sub && (
        <text x={cx} y={cy + 11} textAnchor="middle" dominantBaseline="central" className="dgm-ts">
          {sub}
        </text>
      )}
    </g>
  );
}

/* =========================================================================
   PACKET — nested encapsulation boxes
   ========================================================================= */
const PKT_H = 46;
const PKT_PAD = 8;
const PKT_GAP = 4;

function pktWidth(s: PacketSeg): number {
  const own = Math.max(tw(s.label), s.sub ? tws(s.sub) : 0) + 18;
  if (!s.inner || s.inner.length === 0) return own;
  const innerW =
    s.inner.reduce((a, c) => a + pktWidth(c), 0) + PKT_GAP * (s.inner.length - 1) + PKT_PAD * 2;
  return Math.max(own, innerW);
}
function pktHeight(segs: PacketSeg[]): number {
  let extra = 0;
  for (const s of segs)
    if (s.inner && s.inner.length) extra = Math.max(extra, pktHeight(s.inner) + PKT_PAD + 18);
  return PKT_H + extra;
}

function PacketSegs({
  segs,
  x,
  y,
  h,
}: {
  segs: PacketSeg[];
  x: number;
  y: number;
  h: number;
}): ReactNode {
  let cx = x;
  return segs.map((s, i) => {
    const w = pktWidth(s);
    const hasInner = !!(s.inner && s.inner.length);
    const el = (
      <g key={i}>
        <rect
          x={cx}
          y={y}
          width={w}
          height={h}
          rx={6}
          fill={toneFill(s.tone)}
          stroke={toneLine(s.tone)}
        />
        {hasInner ? (
          <>
            <text x={cx + 9} y={y + 15} className="dgm-t" fill={tone(s.tone)}>
              {s.label}
            </text>
            {s.sub && (
              <text x={cx + 9 + tw(s.label) + 8} y={y + 15} className="dgm-ts">
                {s.sub}
              </text>
            )}
            <PacketSegs segs={s.inner!} x={cx + PKT_PAD} y={y + 24} h={h - 24 - PKT_PAD} />
          </>
        ) : (
          boxText(
            cx + w / 2,
            y + h / 2,
            s.label,
            s.sub,
            s.tone && s.tone !== "default" ? tone(s.tone) : "var(--ink)"
          )
        )}
      </g>
    );
    cx += w + PKT_GAP;
    return el;
  });
}

function PacketD({ d }: { d: Extract<Diagram, { kind: "packet" }> }) {
  const h = pktHeight(d.segs);
  const w = d.segs.reduce((a, s) => a + pktWidth(s), 0) + PKT_GAP * (d.segs.length - 1) + 2;
  return (
    <Frame kind="packet" title={d.title} caption={d.caption} w={w + 2} h={h + 4}>
      <PacketSegs segs={d.segs} x={2} y={2} h={h} />
    </Frame>
  );
}

/* =========================================================================
   SEQ — sequence diagram
   ========================================================================= */
const SEQ_HEAD = 44;
const SEQ_STEP = 42;
const SEQ_NOTE = 34;

function SeqD({ d }: { d: Extract<Diagram, { kind: "seq" }> }) {
  const idp = `sq${uid++}`;
  const n = d.actors.length;
  // Lane spacing: wide enough for the longest arrow label between any lanes.
  let lane = 170;
  for (const s of d.steps)
    if ("label" in s) {
      const need =
        (Math.max(tw(s.label), s.sub ? tws(s.sub) : 0) + 40) /
        Math.max(
          1,
          Math.abs(
            d.actors.findIndex((a) => a.id === s.from) - d.actors.findIndex((a) => a.id === s.to)
          )
        );
      lane = Math.max(lane, need);
    }
  for (const a of d.actors) lane = Math.max(lane, tw(a.label) + 36);
  const pad = Math.max(70, lane / 2);
  const w = pad * 2 + lane * (n - 1);
  const subPad = d.actors.some((a) => a.sub) ? 12 : 0;
  const bodyH = d.steps.reduce((a, s) => a + ("note" in s ? SEQ_NOTE : SEQ_STEP), 0);
  const h = SEQ_HEAD + subPad + bodyH + 18;
  const X = (id: string): number => pad + lane * d.actors.findIndex((a) => a.id === id);

  const tones = new Set<Tone>();
  for (const s of d.steps) tones.add(("tone" in s && s.tone) || "default");

  let y = SEQ_HEAD + subPad + 14;
  return (
    <Frame kind="sequence" title={d.title} caption={d.caption} w={w} h={h}>
      <defs>
        {[...tones].map((t) => (
          <Arrow key={t} id={`${idp}-${t}`} color={tone(t)} />
        ))}
      </defs>
      {/* lifelines */}
      {d.actors.map((a, i) => (
        <line
          key={a.id}
          x1={pad + lane * i}
          y1={SEQ_HEAD - 6}
          x2={pad + lane * i}
          y2={h - 6}
          stroke="var(--line)"
          strokeDasharray="3 5"
        />
      ))}
      {/* actor heads */}
      {d.actors.map((a, i) => {
        const bw = Math.max(tw(a.label) + 22, 74);
        return (
          <g key={a.id}>
            <rect
              x={pad + lane * i - bw / 2}
              y={2}
              width={bw}
              height={30}
              rx={7}
              fill={toneFill(a.tone, 18)}
              stroke={toneLine(a.tone)}
            />
            <text
              x={pad + lane * i}
              y={17}
              textAnchor="middle"
              dominantBaseline="central"
              className="dgm-t"
              fill={a.tone && a.tone !== "default" ? tone(a.tone) : "var(--ink)"}
            >
              {a.label}
            </text>
            {a.sub && (
              <text x={pad + lane * i} y={41} textAnchor="middle" className="dgm-ts">
                {a.sub}
              </text>
            )}
          </g>
        );
      })}
      {/* steps */}
      {d.steps.map((s, i) => {
        if ("note" in s) {
          const el = (
            <g key={i}>
              <text
                x={w / 2}
                y={y + 8}
                textAnchor="middle"
                className="dgm-ts"
                fill={s.tone ? tone(s.tone) : "var(--dim)"}
              >
                ── {s.note} ──
              </text>
            </g>
          );
          y += SEQ_NOTE;
          return el;
        }
        const x1 = X(s.from);
        const x2 = X(s.to);
        const c = tone(s.tone);
        const mid = (x1 + x2) / 2;
        const el = (
          <g key={i}>
            <text x={mid} y={y - 5} textAnchor="middle" className="dgm-t" fill={c}>
              {s.label}
            </text>
            {s.sub && (
              <text x={mid} y={y + 14} textAnchor="middle" className="dgm-ts">
                {s.sub}
              </text>
            )}
            <line
              x1={x1}
              y1={y}
              x2={x2 + (x2 > x1 ? -2 : 2)}
              y2={y}
              stroke={c}
              strokeWidth={1.4}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              markerEnd={`url(#${idp}-${s.tone ?? "default"})`}
            />
          </g>
        );
        y += SEQ_STEP;
        return el;
      })}
    </Frame>
  );
}

/* =========================================================================
   FLOW — left-to-right pipeline
   ========================================================================= */
function FlowD({ d }: { d: Extract<Diagram, { kind: "flow" }> }) {
  const idp = `fl${uid++}`;
  const H = 58;
  const boxes = d.nodes.map((nd) => ({
    ...nd,
    w: Math.max(tw(nd.label), nd.sub ? tws(nd.sub) : 0) + 24,
  }));
  const gaps = boxes.slice(1).map((_, i) => {
    const lbl = d.arrows?.[i];
    return Math.max(44, lbl ? tw(lbl) + 18 : 0);
  });
  const w = boxes.reduce((a, b) => a + b.w, 0) + gaps.reduce((a, b) => a + b, 0) + 4;
  let x = 2;
  return (
    <Frame kind="flow" title={d.title} caption={d.caption} w={w} h={H + 20}>
      <defs>
        <Arrow id={idp} color="var(--dim)" />
      </defs>
      {boxes.map((b, i) => {
        const gEl = (
          <g key={i}>
            <rect
              x={x}
              y={12}
              width={b.w}
              height={H - 12}
              rx={8}
              fill={toneFill(b.tone)}
              stroke={toneLine(b.tone)}
            />
            {boxText(
              x + b.w / 2,
              12 + (H - 12) / 2,
              b.label,
              b.sub,
              b.tone && b.tone !== "default" ? tone(b.tone) : "var(--ink)"
            )}
            {i < boxes.length - 1 && (
              <>
                {d.arrows?.[i] && (
                  <text
                    x={x + b.w + (gaps[i] ?? 44) / 2}
                    y={22}
                    textAnchor="middle"
                    className="dgm-ts"
                  >
                    {d.arrows[i]}
                  </text>
                )}
                <line
                  x1={x + b.w + 4}
                  y1={12 + (H - 12) / 2}
                  x2={x + b.w + (gaps[i] ?? 44) - 6}
                  y2={12 + (H - 12) / 2}
                  stroke="var(--dim)"
                  strokeWidth={1.4}
                  markerEnd={`url(#${idp})`}
                />
              </>
            )}
          </g>
        );
        x += b.w + (gaps[i] ?? 0);
        return gEl;
      })}
    </Frame>
  );
}

/* =========================================================================
   TOPO — nodes on a grid + links
   ========================================================================= */
const T_CELL_W = 168;
const T_CELL_H = 96;

function TopoD({ d }: { d: Extract<Diagram, { kind: "topo" }> }) {
  const idp = `tp${uid++}`;
  const maxX = Math.max(...d.nodes.map((n) => n.x));
  const maxY = Math.max(...d.nodes.map((n) => n.y));
  const w = (maxX + 1) * T_CELL_W;
  const h = (maxY + 1) * T_CELL_H;
  const pos: Record<string, { cx: number; cy: number; w: number; h: number }> = {};
  for (const n of d.nodes) {
    const bw = Math.max(tw(n.label) + 22, 84);
    pos[n.id] = {
      cx: n.x * T_CELL_W + T_CELL_W / 2,
      cy: n.y * T_CELL_H + T_CELL_H / 2,
      w: bw,
      h: n.sub ? 46 : 34,
    };
  }
  const tones = new Set<Tone>(d.links.map((l) => l.tone ?? "default"));
  return (
    <Frame kind="topology" title={d.title} caption={d.caption} w={w} h={h}>
      <defs>
        {[...tones].map((t) => (
          <Arrow key={t} id={`${idp}-${t}`} color={tone(t)} />
        ))}
      </defs>
      {d.links.map((l, i) => {
        const a = pos[l.from];
        const b = pos[l.to];
        if (!a || !b) return null;
        // Trim the line to box edges (approximate with box half-extents).
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const len = Math.hypot(dx, dy) || 1;
        const ax = a.cx + (dx / len) * (Math.abs(dx) > Math.abs(dy) ? a.w / 2 : a.h / 2 + 4);
        const ay = a.cy + (dy / len) * (Math.abs(dx) > Math.abs(dy) ? a.w / 8 : a.h / 2 + 4);
        const bx = b.cx - (dx / len) * (Math.abs(dx) > Math.abs(dy) ? b.w / 2 + 4 : b.h / 2 + 6);
        const by = b.cy - (dy / len) * (Math.abs(dx) > Math.abs(dy) ? b.w / 8 : b.h / 2 + 6);
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        return (
          <g key={i}>
            <line
              x1={ax}
              y1={ay}
              x2={bx}
              y2={by}
              stroke={tone(l.tone)}
              strokeWidth={1.3}
              strokeDasharray={l.dashed ? "5 4" : undefined}
              markerEnd={`url(#${idp}-${l.tone ?? "default"})`}
            />
            {l.label && (
              <g>
                <rect
                  x={mx - tws(l.label) / 2 - 4}
                  y={my - 9}
                  width={tws(l.label) + 8}
                  height={16}
                  rx={4}
                  fill="var(--panel)"
                />
                <text
                  x={mx}
                  y={my}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="dgm-ts"
                >
                  {l.label}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {d.nodes.map((n) => {
        const p = pos[n.id]!;
        const color = n.tone && n.tone !== "default" ? tone(n.tone) : "var(--ink)";
        return (
          <g key={n.id}>
            {n.shape === "cloud" ? (
              <ellipse
                cx={p.cx}
                cy={p.cy}
                rx={p.w / 2 + 10}
                ry={p.h / 2 + 6}
                fill={toneFill(n.tone)}
                stroke={toneLine(n.tone)}
                strokeDasharray="4 4"
              />
            ) : (
              <rect
                x={p.cx - p.w / 2}
                y={p.cy - p.h / 2}
                width={p.w}
                height={p.h}
                rx={n.shape === "round" ? p.h / 2 : 7}
                fill={toneFill(n.tone)}
                stroke={toneLine(n.tone)}
              />
            )}
            {boxText(p.cx, p.cy, n.label, n.sub, color)}
          </g>
        );
      })}
    </Frame>
  );
}

/* =========================================================================
   STACK — side-by-side layer stacks
   ========================================================================= */
const ST_CELL = 34;

function StackD({ d }: { d: Extract<Diagram, { kind: "stack" }> }) {
  const colW = d.cols.map((c) =>
    Math.max(
      tw(c.title) + 20,
      ...c.cells.map((x) => Math.max(tw(x.label), x.sub ? tws(x.sub) : 0) + 24)
    )
  );
  const gap = d.gapLabel ? Math.max(64, tw(d.gapLabel) + 16) : 40;
  const rows = Math.max(...d.cols.map((c) => c.cells.length));
  const w = colW.reduce((a, b) => a + b, 0) + gap * (d.cols.length - 1) + 4;
  const h = 26 + rows * (ST_CELL + 4) + 4;
  let x = 2;
  return (
    <Frame kind="stack" title={d.title} caption={d.caption} w={w} h={h}>
      {d.cols.map((c, i) => {
        const cw = colW[i] ?? 100;
        const el = (
          <g key={i}>
            <text x={x + cw / 2} y={12} textAnchor="middle" className="dgm-ts" fill="var(--mut)">
              {c.title}
            </text>
            {c.cells.map((cell, j) => {
              const cy = 24 + j * (ST_CELL + 4);
              return (
                <g key={j}>
                  <rect
                    x={x}
                    y={cy}
                    width={cw}
                    height={ST_CELL}
                    rx={6}
                    fill={toneFill(cell.tone)}
                    stroke={toneLine(cell.tone)}
                  />
                  {boxText(
                    x + cw / 2,
                    cy + ST_CELL / 2,
                    cell.label,
                    cell.sub,
                    cell.tone && cell.tone !== "default" ? tone(cell.tone) : "var(--ink)"
                  )}
                </g>
              );
            })}
            {i < d.cols.length - 1 && d.gapLabel && (
              <g>
                <line
                  x1={x + cw + 8}
                  y1={24 + (rows * (ST_CELL + 4)) / 2}
                  x2={x + cw + gap - 8}
                  y2={24 + (rows * (ST_CELL + 4)) / 2}
                  stroke="var(--dim)"
                  strokeDasharray="3 4"
                />
                <text
                  x={x + cw + gap / 2}
                  y={24 + (rows * (ST_CELL + 4)) / 2 - 8}
                  textAnchor="middle"
                  className="dgm-ts"
                >
                  {d.gapLabel}
                </text>
              </g>
            )}
          </g>
        );
        x += cw + gap;
        return el;
      })}
    </Frame>
  );
}

/* =========================================================================
   STATE — state machine on a grid
   ========================================================================= */
const SM_CELL_W = 172;
const SM_CELL_H = 92;

function StateD({ d }: { d: Extract<Diagram, { kind: "state" }> }) {
  const idp = `sm${uid++}`;
  const maxX = Math.max(...d.states.map((s) => s.x));
  const maxY = Math.max(...d.states.map((s) => s.y));
  const w = (maxX + 1) * SM_CELL_W;
  const h = (maxY + 1) * SM_CELL_H;
  const pos: Record<string, { cx: number; cy: number; w: number }> = {};
  for (const s of d.states)
    pos[s.id] = {
      cx: s.x * SM_CELL_W + SM_CELL_W / 2,
      cy: s.y * SM_CELL_H + SM_CELL_H / 2,
      w: Math.max(tw(s.label) + 24, 88),
    };
  const tones = new Set<Tone>(d.edges.map((e) => e.tone ?? "default"));
  return (
    <Frame kind="state machine" title={d.title} caption={d.caption} w={w} h={h}>
      <defs>
        {[...tones].map((t) => (
          <Arrow key={t} id={`${idp}-${t}`} color={tone(t)} />
        ))}
      </defs>
      {d.edges.map((e, i) => {
        const a = pos[e.from];
        const b = pos[e.to];
        if (!a || !b) return null;
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const len = Math.hypot(dx, dy) || 1;
        const trimA = Math.abs(dx) > Math.abs(dy) ? a.w / 2 + 2 : 18;
        const trimB = Math.abs(dx) > Math.abs(dy) ? b.w / 2 + 6 : 22;
        const ax = a.cx + (dx / len) * trimA;
        const ay = a.cy + (dy / len) * trimA * (Math.abs(dx) > Math.abs(dy) ? 0.25 : 1);
        const bx = b.cx - (dx / len) * trimB;
        const by = b.cy - (dy / len) * trimB * (Math.abs(dx) > Math.abs(dy) ? 0.25 : 1);
        const bend = e.bend ?? 0;
        // Perpendicular offset for the control point.
        const px = (-(by - ay) / len) * bend;
        const py = ((bx - ax) / len) * bend;
        const mx = (ax + bx) / 2 + px;
        const my = (ay + by) / 2 + py;
        const c = tone(e.tone);
        return (
          <g key={i}>
            <path
              d={`M ${ax} ${ay} Q ${mx} ${my} ${bx} ${by}`}
              fill="none"
              stroke={c}
              strokeWidth={1.3}
              strokeDasharray={e.dashed ? "5 4" : undefined}
              markerEnd={`url(#${idp}-${e.tone ?? "default"})`}
            />
            {e.label && (
              <g>
                <rect
                  x={(ax + bx) / 2 + px * 1.1 - tws(e.label) / 2 - 4}
                  y={(ay + by) / 2 + py * 1.1 - 9}
                  width={tws(e.label) + 8}
                  height={16}
                  rx={4}
                  fill="var(--panel)"
                />
                <text
                  x={(ax + bx) / 2 + px * 1.1}
                  y={(ay + by) / 2 + py * 1.1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="dgm-ts"
                  fill={e.tone && e.tone !== "default" ? c : "var(--mut)"}
                >
                  {e.label}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {d.states.map((s) => {
        const p = pos[s.id]!;
        return (
          <g key={s.id}>
            <rect
              x={p.cx - p.w / 2}
              y={p.cy - 17}
              width={p.w}
              height={34}
              rx={17}
              fill={toneFill(s.tone, 18)}
              stroke={toneLine(s.tone)}
            />
            <text
              x={p.cx}
              y={p.cy}
              textAnchor="middle"
              dominantBaseline="central"
              className="dgm-t"
              fill={s.tone && s.tone !== "default" ? tone(s.tone) : "var(--ink)"}
            >
              {s.label}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}

/* ---------- dispatcher ---------- */
export function DiagramView({ d }: { d: Diagram }) {
  switch (d.kind) {
    case "packet":
      return <PacketD d={d} />;
    case "seq":
      return <SeqD d={d} />;
    case "flow":
      return <FlowD d={d} />;
    case "topo":
      return <TopoD d={d} />;
    case "stack":
      return <StackD d={d} />;
    case "state":
      return <StateD d={d} />;
    default:
      return null;
  }
}
