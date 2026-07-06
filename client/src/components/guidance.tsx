import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { md } from "../lib/render";
import { guidanceLevel, HINT_AFTER, REVEAL_AFTER } from "../lib/guidance";

export { HINT_AFTER, REVEAL_AFTER };

/** Track wrong checks for a single exercise (order, blank, CIDR, etc.). */
export function useWrongAttempts(initial = 0) {
  const [attempts, setAttempts] = useState(initial);
  const recordWrong = useCallback(() => setAttempts((a) => a + 1), []);
  const reset = useCallback(() => setAttempts(0), []);
  const level = guidanceLevel(attempts);
  return { attempts, recordWrong, reset, level, showHint: level !== "none", showReveal: level === "reveal" };
}

/** Track wrong checks per question index (labs, module quizzes). */
export function useQuestionAttempts() {
  const [attempts, setAttempts] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const recordWrong = useCallback((qi: number) => {
    setAttempts((a) => ({ ...a, [qi]: (a[qi] ?? 0) + 1 }));
  }, []);

  const level = useCallback((qi: number) => guidanceLevel(attempts[qi] ?? 0), [attempts]);
  const reveal = useCallback((qi: number) => setRevealed((r) => ({ ...r, [qi]: true })), []);
  const isRevealed = useCallback((qi: number) => !!revealed[qi], [revealed]);
  const clearRevealed = useCallback(() => setRevealed({}), []);

  return { recordWrong, level, reveal, isRevealed, clearRevealed };
}

function renderMd(content: ReactNode) {
  return typeof content === "string" ? md(content) : content;
}

export function HintBlock({ children }: { children: ReactNode }) {
  return (
    <p className="hint" role="status">
      <span className="hint-lbl">Hint</span>
      {renderMd(children)}
    </p>
  );
}

export function RevealBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn ghost" onClick={onClick}>
      SHOW ANSWER
    </button>
  );
}

export function AnswerBlock({ children }: { children: ReactNode }) {
  return (
    <p className="why revealed" role="status">
      <span className="hint-lbl">Answer</span>
      {renderMd(children)}
    </p>
  );
}
