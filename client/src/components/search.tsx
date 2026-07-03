import React, { useEffect, useMemo, useRef, useState } from "react";
import { search } from "../lib/search";
import type { SearchResult } from "../lib/search";

/* Search overlay: opens via the header button or the / and Ctrl/Cmd-K shortcuts.
   Full keyboard support — arrows move the active result, Enter jumps, Esc closes.
   Results announce their count via a live region. */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const parts = useMemo(() => {
    if (!terms.length) return [text];
    const re = new RegExp(
      "(" + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")",
      "ig"
    );
    return text.split(re);
  }, [text, terms]);
  return parts.map((p, i) =>
    terms.some((t) => p.toLowerCase() === t) ? (
      <mark key={i}>{p}</mark>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    )
  );
}

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  onJump: (r: SearchResult) => void;
}

export function SearchOverlay({ open, onClose, onJump }: SearchOverlayProps) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const results = useMemo(() => (q.trim().length >= 2 ? search(q) : []), [q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  useEffect(() => {
    // keep the active row scrolled into view
    const el = listRef.current && listRef.current.children[active];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const jump = (r: SearchResult) => {
    onJump(r);
    onClose();
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      const r = results[active];
      if (r) {
        e.preventDefault();
        jump(r);
      }
    }
  };

  return (
    <div className="searchveil" onClick={onClose} role="presentation">
      <div
        className="searchbox"
        role="dialog"
        aria-modal="true"
        aria-label="Search the curriculum"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="searchinput"
          placeholder="Search lessons, labs & quizzes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="search-results"
          aria-activedescendant={results[active] ? "sr-" + active : undefined}
          aria-autocomplete="list"
        />
        <div className="sr-only" role="status">
          {q.trim().length >= 2 ? results.length + " results" : ""}
        </div>
        {q.trim().length >= 2 && (
          <ul className="searchresults" id="search-results" role="listbox" ref={listRef}>
            {results.length === 0 && (
              <li className="sr-empty">No matches — try a protocol name, tool, or concept.</li>
            )}
            {results.map((r, i) => (
              <li
                key={r.modId + ":" + r.tab + ":" + r.title}
                id={"sr-" + i}
                role="option"
                aria-selected={i === active}
                className={"sr-row" + (i === active ? " on" : "")}
                onMouseEnter={() => setActive(i)}
                onClick={() => jump(r)}
              >
                <div className="sr-head">
                  <span className="sr-code">{r.code}</span>
                  <span className={"sr-kind k-" + r.kind}>{r.kind.toUpperCase()}</span>
                  <span className="sr-title">
                    <Highlight text={r.title} terms={r.matchTerms} />
                  </span>
                </div>
                <div className="sr-snippet">
                  <Highlight text={r.snippet} terms={r.matchTerms} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="sr-hints" aria-hidden="true">
          <span>
            <kbd>↑↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> jump
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
