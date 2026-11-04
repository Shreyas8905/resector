"use client";

import React from "react";
import { Link2, MessageSquare, Sparkles } from "lucide-react";

export type DockTab = "ask" | "links" | "comments";

/** The three assistant panels share one dock. These tabs switch between them. */
export default function DockTabs({ active, onPick, pendingLinks, openComments }: {
  active: DockTab; onPick: (t: DockTab) => void; pendingLinks: number; openComments: number;
}) {
  const tabs: { id: DockTab; label: string; Icon: React.ComponentType<{ size?: number }>; color: string; count: number }[] = [
    { id: "ask", label: "Ask", Icon: Sparkles, color: "var(--tool-ask)", count: 0 },
    { id: "links", label: "Connections", Icon: Link2, color: "var(--tool-links)", count: pendingLinks },
    { id: "comments", label: "Comments", Icon: MessageSquare, color: "var(--tool-notes)", count: openComments },
  ];
  return (
    <div className="flex min-w-0 flex-1 gap-0.5" role="tablist" aria-label="Assistant">
      {tabs.map(({ id, label, Icon, color, count }) => (
        <button key={id} role="tab" aria-selected={active === id} onClick={() => onPick(id)}
          style={{ "--t": color } as React.CSSProperties}
          className={`flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${active === id ? "bg-[color-mix(in_srgb,var(--t)_14%,transparent)] text-[var(--t)]" : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"}`}>
          <Icon size={15} />
          <span className="truncate">{label}</span>
          {count > 0 && <span className="rounded-full bg-[var(--t)] px-1.5 text-[0.75rem] font-semibold leading-5 text-[var(--background)]">{count}</span>}
        </button>
      ))}
    </div>
  );
}
