/* Theme manager: "light" | "dark" | "system", persisted, with live system tracking */
import { useEffect, useState } from "react";

const KEY = "tunnelcraft:theme";

export type ThemeMode = "system" | "light" | "dark";

export const THEME_MODES: readonly ThemeMode[] = ["system", "light", "dark"];

export function getThemeMode(): ThemeMode {
  const v = localStorage.getItem(KEY);
  return v !== null && THEME_MODES.includes(v as ThemeMode) ? (v as ThemeMode) : "system";
}

function systemPrefersLight(): boolean {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
}

function resolve(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? (systemPrefersLight() ? "light" : "dark") : mode;
}

export function applyTheme(mode: ThemeMode): void {
  const effective = resolve(mode);
  document.documentElement.dataset["theme"] = effective;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", effective === "light" ? "#F2EFE7" : "#0F1215");
}

/* Hook: returns [mode, cycle, effective]; follows OS changes while in system mode */
export function useTheme(): [ThemeMode, () => void, "light" | "dark"] {
  const [mode, setMode] = useState<ThemeMode>(() => getThemeMode());

  useEffect(() => {
    applyTheme(mode);
    localStorage.setItem(KEY, mode);
    if (mode !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  // The modulo keeps the index in range, but tsc can't see that.
  const cycle = () =>
    setMode(THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length] ?? "system");
  return [mode, cycle, resolve(mode)];
}
