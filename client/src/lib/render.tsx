import type { ReactNode } from "react";
import type { Block, CodeLang, LayerTag } from "../curriculum/types";
import { DiagramView } from "./diagram";

/* ---------- inline markdown (backticks + bold) ---------- */
export function md(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t[0] === "`")
      out.push(
        <code key={k++} className="ic">
          {t.slice(1, -1)}
        </code>
      );
    else out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/* ---------- tiny syntax highlighter ---------- */
const HLR: Partial<Record<CodeLang, RegExp>> = {
  rust: /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*!)|(\b(?:fn|let|mut|pub|use|mod|struct|enum|impl|trait|for|in|if|else|match|while|loop|return|async|await|move|dyn|where|const|static|type|crate|self|Self|as|unsafe|break|continue)\b)|('(?:[a-z_][a-z0-9_]*)\b)|(\b[A-Z][A-Za-z0-9_]*\b)/g,
  sh: /(#[^\n]*)|("(?:[^"\\]|\\.)*"|'[^']*')|(\b(?:sudo|ip|wg|cargo|curl|tc|ping|nft|netsh|ifconfig|route|brew|apt|systemctl|tcpdump|echo|cat|scutil)\b)/g,
};
const HLCLS: Partial<Record<CodeLang, string[]>> = {
  rust: ["com", "str", "num", "mac", "kw", "life", "typ"],
  sh: ["com", "str", "kw"],
};

export function hl(code: string, lang: CodeLang): ReactNode[] | string {
  const re = HLR[lang];
  const classes = HLCLS[lang];
  if (!re || !classes) return code;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  re.lastIndex = 0;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    let cls = "";
    for (let g = 1; g < m.length; g++) {
      if (m[g] !== undefined) {
        cls = classes[g - 1] ?? "";
        break;
      }
    }
    out.push(
      <span key={k++} className={"tk-" + cls}>
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

/** Rust Playground share link for self-contained snippets (CodeSpec.run). */
export function playgroundUrl(body: string): string {
  return (
    "https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&code=" +
    encodeURIComponent(body)
  );
}

export function CodeBlock({
  lang,
  body,
  run,
}: {
  lang: CodeLang;
  body: string;
  run?: boolean | undefined;
}) {
  const label = lang === "sh" ? "shell" : lang === "text" ? "diagram" : lang;
  return (
    <div className="cb">
      <div className="cb-lang">
        {label}
        {run && lang === "rust" && (
          <a
            className="cb-run"
            href={playgroundUrl(body)}
            target="_blank"
            rel="noreferrer"
            aria-label="Run this snippet on the Rust Playground (opens in a new tab)"
          >
            ▶ RUN ON PLAYGROUND
          </a>
        )}
      </div>
      <pre>
        <code>{hl(body, lang)}</code>
      </pre>
    </div>
  );
}

export function Blocks({ blocks }: { blocks: Block[] }): ReactNode {
  return blocks.map((b, i) => {
    if ("p" in b) return <p key={i}>{md(b.p)}</p>;
    if ("h" in b)
      return (
        <h4 key={i} className="lh">
          {b.h}
        </h4>
      );
    if ("ul" in b)
      return (
        <ul key={i}>
          {b.ul.map((it, j) => (
            <li key={j}>{md(it)}</li>
          ))}
        </ul>
      );
    if ("code" in b)
      return <CodeBlock key={i} lang={b.code.lang} body={b.code.body} run={b.code.run} />;
    if ("diagram" in b) return <DiagramView key={i} d={b.diagram} />;
    if ("note" in b)
      return (
        <div key={i} className="callout">
          <span className="co-l">{b.label || "FIELD NOTE"}</span>
          <p>{md(b.note)}</p>
        </div>
      );
    if ("tbl" in b)
      return (
        <div key={i} className="tblwrap">
          <table>
            <thead>
              <tr>
                {b.tbl.head.map((h, j) => (
                  <th key={j}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.tbl.rows.map((r, j) => (
                <tr key={j}>
                  {r.map((c, x) => (
                    <td key={x}>{md(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    return null;
  });
}

/* ---------- layer glyph ---------- */
export const LAYER_STACK: readonly LayerTag[] = ["L7", "L6", "L5", "L4", "L3", "L2", "L1"];

export function LayerGlyph({ on, size }: { on: LayerTag[]; size?: "lg" }) {
  return (
    <div className={"glyph" + (size === "lg" ? " glyph-lg" : "")} aria-hidden="true">
      {LAYER_STACK.map((l) => (
        <span
          key={l}
          className="gbar"
          style={{ background: on.includes(l) ? `var(--${l.toLowerCase()})` : "var(--line)" }}
        />
      ))}
    </div>
  );
}

export function LayerTags({ on }: { on: LayerTag[] }) {
  const names: Record<LayerTag, string> = {
    L1: "L1 physical",
    L2: "L2 link",
    L3: "L3 network",
    L4: "L4 transport",
    L5: "L5 session",
    L6: "L6 presentation",
    L7: "L7 application",
    RS: "rust",
    XP: "cross-platform",
  };
  return (
    <div className="ltags">
      {on.map((l) => (
        <span
          key={l}
          className="ltag"
          style={
            l.startsWith("L")
              ? {
                  color: `var(--${l.toLowerCase()})`,
                  borderColor: `color-mix(in srgb, var(--${l.toLowerCase()}) 45%, transparent)`,
                }
              : { color: "var(--acc2)", borderColor: "rgba(247,107,51,.4)" }
          }
        >
          {names[l] || l}
        </span>
      ))}
    </div>
  );
}
