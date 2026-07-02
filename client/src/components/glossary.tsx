import { useMemo, useState } from "react";
import { md } from "../lib/render";
import { GLOSSARY } from "../curriculum/glossary";
import { ALL_MODULES } from "../curriculum/tracks";
import type { Route } from "../App";

/* Glossary: every defined term in the course, filterable, each deep-linking
   to the module where it's taught. */
const byId = Object.fromEntries(ALL_MODULES.map((m) => [m.id, m]));

export function GlossaryView({ go }: { go: (r: Route) => void }) {
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();

  const entries = useMemo(
    () =>
      f
        ? GLOSSARY.filter((e) => e.t.toLowerCase().includes(f) || e.d.toLowerCase().includes(f))
        : GLOSSARY,
    [f]
  );

  const groups = useMemo(() => {
    const out: { letter: string; items: typeof GLOSSARY }[] = [];
    for (const e of entries) {
      const ch = e.t[0]?.toUpperCase() ?? "#";
      const letter = ch >= "A" && ch <= "Z" ? ch : "#";
      const last = out[out.length - 1];
      if (last && last.letter === letter) last.items.push(e);
      else out.push({ letter, items: [e] });
    }
    return out;
  }, [entries]);

  return (
    <div className="wrap">
      <button className="back" onClick={() => go({ v: "home" })}>
        ← BACK TO COURSE
      </button>
      <div className="glosshead">
        <div>
          <p className="eyebrow">FIELD GLOSSARY</p>
          <h2 className="modtitle">{GLOSSARY.length} terms, every layer of the stack</h2>
        </div>
        <input
          className="glossfilter"
          type="search"
          placeholder={"filter " + GLOSSARY.length + " terms…"}
          value={filter}
          aria-label="Filter glossary terms"
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {entries.length === 0 && (
        <p className="authsub">No terms match “{filter}” — try a shorter fragment.</p>
      )}
      {groups.map((g) => (
        <section key={g.letter} className="glossgroup">
          <div className="glossletter">{g.letter}</div>
          <dl className="glosslist">
            {g.items.map((e) => {
              const mod = byId[e.mod];
              return (
                <div className="glossrow" key={e.t}>
                  <dt>{e.t}</dt>
                  <dd>
                    {md(e.d)}{" "}
                    {mod && (
                      <button
                        className="glossmod"
                        onClick={() => go({ v: "mod", id: mod.id })}
                        aria-label={"Open module " + mod.code + " — " + mod.title}
                      >
                        → {mod.code}
                      </button>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
