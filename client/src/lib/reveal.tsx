/* Scroll-reveal primitives. Purely decorative: content is visible
   immediately when IntersectionObserver is missing or the user
   prefers reduced motion (motion.css handles the latter). */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setSeen(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, seen };
}

/* Wrap a block to fade-rise it into view. `stagger` cascades the
   direct children instead of animating the wrapper. */
export function Reveal({
  className = "",
  stagger = false,
  children,
}: {
  className?: string;
  stagger?: boolean;
  children: ReactNode;
}) {
  const { ref, seen } = useReveal<HTMLDivElement>();
  const cls = [className, stagger ? "rvs" : "rv", seen ? "rv-in" : ""].filter(Boolean).join(" ");
  return (
    <div ref={ref} className={cls}>
      {children}
    </div>
  );
}
