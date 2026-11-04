"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";

export type PaletteItem = {
  id: string; label: string; hint?: string; group: string;
  icon?: React.ReactNode; keywords?: string; run: () => void;
};

/** Ctrl+K (or Cmd+K): type to jump anywhere or change a setting. Everything here is also reachable with the mouse. */
export default function CommandPalette({ items, open, onClose }: { items: PaletteItem[]; open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => { if (open) { setQ(""); setAt(0); } }, [open]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return items;
    return items.filter((i) => `${i.label} ${i.hint ?? ""} ${i.keywords ?? ""} ${i.group}`.toLowerCase().includes(n));
  }, [items, q]);

  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" }); }, [at]);

  if (!open) return null;
  const choose = (i: PaletteItem | undefined) => { if (!i) return; onClose(); window.setTimeout(i.run, 0); };

  return (
    <div className="anim-fade fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-4 pt-[14vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Search and jump" onMouseDown={(e) => e.stopPropagation()}
        className="anim-pop w-full max-w-xl overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-pop)]">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4">
          <Search size={18} className="shrink-0 text-[var(--muted)]" />
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Where do you want to go, or what do you want to do?"
            aria-label="Search" className="h-14 w-full bg-transparent text-base outline-none placeholder:text-[var(--subtle)]"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") { e.preventDefault(); setAt((a) => Math.min(a + 1, shown.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); choose(shown[at]); }
            }}
          />
          <span className="kbd">Esc</span>
        </div>
        <ul ref={list} className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-[var(--muted)]">Nothing matches “{q}”.</li>}
          {shown.map((it, i) => (
            <React.Fragment key={it.id}>
              {(i === 0 || shown[i - 1].group !== it.group) && <li className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-[var(--subtle)]" role="presentation">{it.group}</li>}
              <li role="option" aria-selected={i === at} data-i={i}>
                <button onClick={() => choose(it)} onMouseMove={() => setAt(i)}
                  className={`flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-left ${i === at ? "bg-[var(--accent-soft)]" : ""}`}>
                  {it.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-medium">{it.label}</span>
                    {it.hint && <span className="block truncate text-xs text-[var(--muted)]">{it.hint}</span>}
                  </span>
                  {i === at && <CornerDownLeft size={14} className="shrink-0 text-[var(--muted)]" />}
                </button>
              </li>
            </React.Fragment>
          ))}
        </ul>
      </div>
    </div>
  );
}
