"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/** A panel width the user can drag, remembered between launches (per panel key). */
export function usePanelWidth(key: string, initial: number, min: number, max: number) {
  const storeKey = `resector_panel_${key}`;
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(storeKey));
      if (v >= min && v <= max) setWidth(v);
    } catch { /* storage unavailable: keep the default */ }
  }, [storeKey, min, max]);

  const set = useCallback((w: number) => {
    const c = Math.round(Math.min(max, Math.max(min, w)));
    setWidth(c);
    try { localStorage.setItem(storeKey, String(c)); } catch { /* not remembered */ }
  }, [storeKey, min, max]);

  return { width, set, reset: () => set(initial), min, max };
}

/** Drag handle placed on the edge of a panel. `edge` is the side of the panel it sits on:
 *  a panel on the right of the screen has its handle on its "left" edge, and so on.
 *  Drag, use the arrow keys, or double-click to reset. Hidden on small screens. */
export function ResizeHandle({ panel, edge, label }: {
  panel: { width: number; set: (w: number) => void; reset: () => void; min: number; max: number };
  edge: "left" | "right"; label: string;
}) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const sign = edge === "left" ? -1 : 1;     // dragging towards the page centre makes the panel wider

  return (
    <div
      role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={panel.width}
      aria-valuemin={panel.min} aria-valuemax={panel.max} tabIndex={0}
      title="Drag to resize. Double-click to reset."
      className={`group absolute inset-y-0 z-30 hidden w-2 cursor-col-resize touch-none select-none md:block ${edge === "left" ? "-left-1" : "-right-1"}`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: panel.width };
        setDragging(true);
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => { if (start.current) panel.set(start.current.w + sign * (e.clientX - start.current.x)); }}
      onPointerUp={() => { start.current = null; setDragging(false); document.body.style.userSelect = ""; }}
      onPointerCancel={() => { start.current = null; setDragging(false); document.body.style.userSelect = ""; }}
      onDoubleClick={panel.reset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowLeft") { e.preventDefault(); panel.set(panel.width + (edge === "left" ? step : -step)); }
        if (e.key === "ArrowRight") { e.preventDefault(); panel.set(panel.width + (edge === "left" ? -step : step)); }
      }}
    >
      <span className={`absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full transition-colors ${dragging ? "bg-[var(--accent)]" : "bg-transparent group-hover:bg-[var(--accent-line)] group-focus-visible:bg-[var(--accent)]"}`} />
    </div>
  );
}

/** Style for a resizable panel: width from a CSS variable on md+ screens only. */
export const panelStyle = (width: number) => ({ ["--panel-w" as string]: `${width}px` }) as React.CSSProperties;
