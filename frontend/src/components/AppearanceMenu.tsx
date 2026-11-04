"use client";

import React, { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { TEXT_SIZES, useAppearance, type ThemePref } from "@/lib/appearance";

const THEMES: { id: ThemePref; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "Auto", Icon: Monitor },
];

/** One small menu for how ReSector looks: theme and text size. Lives at the bottom of the navigation. */
const RAIL_BTN = "flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-[0.75rem] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]";

export default function AppearanceMenu({ compact = false, stacked = false }: { compact?: boolean; stacked?: boolean }) {
  const { theme, setTheme, text, setText } = useAppearance();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-haspopup="dialog" title="Appearance: theme and text size"
        aria-label={compact ? "Appearance" : undefined}
        className={stacked ? RAIL_BTN : `flex w-full items-center gap-3 rounded-[var(--radius-control)] py-2 text-left text-[0.9375rem] text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] ${compact ? "justify-center px-0" : "px-3"}`}
      >
        <Palette size={stacked ? 22 : 18} className="shrink-0" />
        {stacked ? <span>Text size</span> : !compact && <span className="truncate">Appearance</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Appearance" className="anim-pop absolute bottom-0 left-full z-50 ml-3 w-72 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-pop)]">
          <p className="mb-2 text-sm font-semibold">Theme</p>
          <div className="seg w-full" role="group" aria-label="Theme">
            {THEMES.map(({ id, label, Icon }) => (
              <button key={id} aria-pressed={theme === id} onClick={() => setTheme(id)} className="flex-1 justify-center">
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-4 text-sm font-semibold">Text size</p>
          <div className="seg w-full" role="group" aria-label="Text size">
            {TEXT_SIZES.map((s, i) => (
              <button key={s.id} aria-pressed={text === s.id} onClick={() => setText(s.id)} className="flex-1 justify-center" title={s.label}
                style={{ fontSize: `${0.875 + i * 0.125}rem` }}>
                Aa
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">{TEXT_SIZES.find((s) => s.id === text)?.label}. Applies everywhere.</p>
        </div>
      )}
    </div>
  );
}
