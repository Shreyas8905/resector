"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
export type TextSize = "normal" | "large" | "xlarge";

const THEME_KEY = "resector_theme";
const TEXT_KEY = "resector_text";

export const TEXT_SIZES: { id: TextSize; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "large", label: "Large" },
  { id: "xlarge", label: "Extra large" },
];

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch { return fallback; }
}

function resolveDark(pref: ThemePref): boolean {
  return pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function applyTheme(pref: ThemePref) {
  const dark = resolveDark(pref);
  const r = document.documentElement;
  r.dataset.theme = dark ? "dark" : "light";
  r.classList.toggle("dark", dark);
}

export function applyTextSize(size: TextSize) {
  const r = document.documentElement;
  if (size === "normal") delete r.dataset.text; else r.dataset.text = size;
}

/** Theme (Light / Dark / Auto) and text size, remembered on this computer. */
export function useAppearance() {
  const [theme, setThemeState] = useState<ThemePref>("system");
  const [text, setTextState] = useState<TextSize>("normal");

  useEffect(() => {
    // saved values only ever hold "light" or "dark" when the person made a choice; nothing saved means Auto
    setThemeState(read<ThemePref>(THEME_KEY, ["light", "dark"], "system"));
    setTextState(read<TextSize>(TEXT_KEY, ["large", "xlarge"], "normal"));
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);

  // Several parts of the screen use this hook (the rail's quick toggle, the Look menu): keep them in step.
  useEffect(() => {
    const sync = (e: Event) => {
      const d = (e as CustomEvent<{ theme?: ThemePref; text?: TextSize }>).detail || {};
      if (d.theme) setThemeState(d.theme);
      if (d.text) setTextState(d.text);
    };
    window.addEventListener("resector:appearance", sync);
    return () => window.removeEventListener("resector:appearance", sync);
  }, []);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    window.dispatchEvent(new CustomEvent("resector:appearance", { detail: { theme: t } }));
    try { t === "system" ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, t); } catch { /* not remembered */ }
    applyTheme(t);
  }, []);

  const setText = useCallback((t: TextSize) => {
    setTextState(t);
    window.dispatchEvent(new CustomEvent("resector:appearance", { detail: { text: t } }));
    try { t === "normal" ? localStorage.removeItem(TEXT_KEY) : localStorage.setItem(TEXT_KEY, t); } catch { /* not remembered */ }
    applyTextSize(t);
  }, []);

  return { theme, setTheme, text, setText };
}
