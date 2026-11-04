"use client";

import React, { useState } from "react";
import { Copy, FilePlus2, FileText, MoreHorizontal, Trash2 } from "lucide-react";
import type { DraftSummary } from "@/lib/dashboardApi";

/** Every draft on this dashboard, like the pages panel in a design tool. The tick says whether the AI may read a
 *  draft for context (Ask, Autopilot). The draft you are editing is always the one in front of you. */
export default function DraftList({ drafts, currentId, ctxOff, onToggleContext, onOpen, onNew, onDuplicate, onDelete }: {
  drafts: DraftSummary[]; currentId: number | null; ctxOff: number[];
  onToggleContext: (id: number) => void; onOpen: (id: number) => void; onNew: () => void;
  onDuplicate: (id: number) => void; onDelete: (id: number) => void;
}) {
  const [menu, setMenu] = useState<number | null>(null);
  const reading = drafts.filter((d) => !ctxOff.includes(d.id)).length;
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]" aria-label="Your drafts">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h3 className="text-sm font-semibold">Drafts</h3>
        <button className="btn btn-secondary !px-2.5" onClick={onNew} title="Start another draft on this dashboard"><FilePlus2 size={15} /> New</button>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {drafts.map((d) => {
          const on = !ctxOff.includes(d.id);
          const current = d.id === currentId;
          return (
            <li key={d.id} className="group relative">
              <div className={`flex items-start gap-2 rounded-xl px-2 py-2.5 ${current ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-muted)]"}`}>
                <button className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => onOpen(d.id)} aria-current={current ? "true" : undefined}>
                  <FileText size={16} className={`mt-0.5 shrink-0 ${current ? "text-[var(--accent)]" : "text-[var(--subtle)]"}`} />
                  <span className="min-w-0">
                    <span className={`block truncate text-[0.9375rem] ${current ? "font-semibold" : "font-medium"}`}>{d.title || "Untitled draft"}</span>
                    <span className="block text-[0.75rem] text-[var(--muted)]">{d.words} {d.words === 1 ? "word" : "words"}</span>
                  </span>
                </button>
                <button className="icon-btn !h-7 !w-7 opacity-0 focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Actions for ${d.title}`} onClick={() => setMenu(menu === d.id ? null : d.id)}><MoreHorizontal size={15} /></button>
              </div>
              <label className="flex cursor-pointer items-center gap-2 px-3 pb-1 pt-0.5 text-[0.75rem] text-[var(--muted)]" title="Let the AI read this draft for context when you ask questions or use Autopilot">
                <input type="checkbox" checked={on} onChange={() => onToggleContext(d.id)} /> AI can read this
              </label>
              {menu === d.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                  <div role="menu" className="float anim-pop absolute right-2 top-10 z-50 w-44 p-1" onClick={() => setMenu(null)}>
                    <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--surface-muted)]" onClick={() => onDuplicate(d.id)}><Copy size={15} /> Duplicate</button>
                    <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--danger)] hover:bg-[var(--surface-muted)]" onClick={() => onDelete(d.id)}><Trash2 size={15} /> Delete</button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {drafts.length > 1 && <p className="border-t border-[var(--border)] px-4 py-3 text-[0.75rem] leading-snug text-[var(--muted)]">The AI is reading {reading} of {drafts.length} drafts for context.</p>}
    </aside>
  );
}
