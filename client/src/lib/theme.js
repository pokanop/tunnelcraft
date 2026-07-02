/* Theme manager: "light" | "dark" | "system", persisted, with live system tracking */
import { useEffect, useState } from "react";

const KEY = "tunnelcraft:theme";
export const THEME_MODES = ["system", "light", "dark"];

export function getThemeMode() {
  const v = localStorage.getItem(KEY);
  return THEME_MODES.includes(v) ? v : "system";
}

function systemPrefersLight() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
}

function resolve(mode) {
  return mode === "system" ? (systemPrefersLight() ? "light" : "dark") : mode;
}

export function applyTheme(mode) {
  const effective = resolve(mode);
  document.documentElement.dataset.theme = effective;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", effective === "light" ? "#F2EFE7" : "#0F1215");
}

/* Hook: returns [mode, cycle, effective]; follows OS changes while in system mode */
export function useTheme() {
  const [mode, setMode] = useState(() => getThemeMode());

  useEffect(() => {
    applyTheme(mode);
    localStorage.setItem(KEY, mode);
    if (mode !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const cycle = () => setMode(THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length]);
  return [mode, cycle, resolve(mode)];
}
