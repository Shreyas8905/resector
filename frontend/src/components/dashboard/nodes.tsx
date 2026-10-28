"use client";

import React from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight, FileText, Loader2, MessageSquare, Quote, Target, ImageIcon } from "lucide-react";
import { useCanvas } from "./context";
import { dashboardApi } from "@/lib/dashboardApi";

const handle = "!h-2.5 !w-2.5 !border-2 !border-[var(--surface)] !bg-[var(--accent)]";

function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Left} className={handle} />
      <Handle type="source" position={Position.Right} className={handle} />
      <Handle type="target" position={Position.Top} id="t" className={handle} />
      <Handle type="source" position={Position.Bottom} id="b" className={handle} />
    </>
  );
}

function Shell({ id, selected, children, className = "", accent }: {
  id: string; selected?: boolean; children: React.ReactNode; className?: string; accent?: string;
}) {
  const { searchHits, commentCounts, comment } = useCanvas();
  const dim = searchHits && !searchHits.has(id);
  const n = commentCounts.get(id) || 0;
  return (
    <div
      className={`group relative rounded-xl border bg-[var(--surface)] shadow-[0_1px_2px_rgb(27_52_91/0.08)] transition-[opacity,box-shadow] ${selected ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30" : "border-[var(--border)]"} ${dim ? "opacity-25" : ""} ${className}`}
      style={accent ? { borderTopColor: accent, borderTopWidth: 3 } : undefined}
    >
      <Handles />
      {children}
      <button
        onClick={(e) => { e.stopPropagation(); comment(id); }}
        className={`nodrag absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-1 text-[10px] text-[var(--muted)] shadow-sm hover:text-[var(--foreground)] ${n ? "" : "opacity-0 group-hover:opacity-100"}`}
        title="Comments"
      >
        <MessageSquare size={11} />{n > 0 && n}
      </button>
    </div>
  );
}

const field = "nodrag nowheel w-full resize-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-[var(--subtle)] hover:border-[var(--border)] focus:border-[var(--border-strong)] focus:bg-[var(--surface-muted)]";

function Text({ id, value, field: key, placeholder, rows = 3, className = "" }: {
  id: string; value: string; field: string; placeholder: string; rows?: number; className?: string;
}) {
  const { update, snapshot } = useCanvas();
  return (
    <textarea
      className={`${field} ${className}`} rows={rows} value={value} placeholder={placeholder}
      onFocus={snapshot} onChange={(e) => update(id, { [key]: e.target.value })}
    />
  );
}

// ---------------------------------------------------------------- paper
export function PaperNode({ id, data, selected }: NodeProps) {
  const { docs, excerpts, openReader, update } = useCanvas();
  const d = data as { document_id: number; expanded?: boolean; note?: string };
  const doc = docs.get(d.document_id);
  const mine = Array.from(excerpts.values()).filter((e) => e.document_id === d.document_id);
  const indexing = doc && doc.status !== "completed" && doc.status !== "failed";
  const name = doc?.filename ?? "Paper";
  return (
    <Shell id={id} selected={selected} className="w-[300px]" accent="#2563eb">
      <div className="flex items-start gap-2 p-3">
        <FileText size={18} className="mt-0.5 shrink-0 text-[#2563eb]" />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium leading-snug" title={name}>{name.replace(/\.pdf$/i, "")}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
            {indexing ? <span className="flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Reading… {doc?.progress ?? 0}%</span>
              : doc?.status === "failed" ? <span className="text-[var(--danger)]">Couldn’t read this file</span>
              : <span>{mine.length} saved {mine.length === 1 ? "excerpt" : "excerpts"}</span>}
          </div>
        </div>
        <button className="nodrag rounded-md p-1 text-[var(--muted)] hover:bg-[var(--surface-muted)]" title={d.expanded ? "Collapse" : "Expand"}
          onClick={() => update(id, { expanded: !d.expanded })}>
          {d.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
      <div className="px-3 pb-3">
        <button disabled={!doc || doc.status === "failed"} onClick={() => openReader(d.document_id)}
          className="nodrag w-full rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-muted)] disabled:opacity-50">
          Open and read
        </button>
      </div>
      {d.expanded && (
        <div className="space-y-2 border-t border-[var(--border)] p-3">
          <Text id={id} field="note" value={d.note ?? ""} placeholder="Your notes on this paper…" rows={3} />
          {mine.length > 0 && (
            <ul className="space-y-1.5">
              {mine.slice(0, 8).map((e) => (
                <li key={e.id}>
                  <button onClick={() => openReader(d.document_id, e.id)} className="nodrag w-full rounded-md bg-[var(--surface-muted)] px-2 py-1.5 text-left text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
                    <span className="line-clamp-2">{e.quote || "Saved figure or table"}</span>
                    <span className="text-[10px] text-[var(--subtle)]">page {e.page}</span>
                  </button>
                </li>
              ))}
              {mine.length > 8 && <li className="text-center text-[10px] text-[var(--subtle)]">+{mine.length - 8} more</li>}
            </ul>
          )}
        </div>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------- excerpt
export function ExcerptNode({ id, data, selected }: NodeProps) {
  const { docs, excerpts, openReader } = useCanvas();
  const d = data as { excerpt_id: number; note?: string };
  const ex = excerpts.get(d.excerpt_id);
  if (!ex) return <Shell id={id} selected={selected} className="w-[260px] p-3 text-xs text-[var(--muted)]">This excerpt was removed.</Shell>;
  const paper = docs.get(ex.document_id)?.filename?.replace(/\.pdf$/i, "") ?? "Paper";
  return (
    <Shell id={id} selected={selected} className="w-[280px]" accent="#d97706">
      <div className="p-3">
        {ex.kind === "area" && ex.has_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dashboardApi.excerptImageUrl(ex.id)} alt="Saved area from the paper" className="mb-2 max-h-56 w-full rounded-md border border-[var(--border)] bg-white object-contain" />
        ) : (
          <div className="flex gap-2">
            <Quote size={14} className="mt-0.5 shrink-0 text-[#d97706]" />
            <p className="line-clamp-[10] text-sm italic leading-snug">{ex.quote}</p>
          </div>
        )}
        <button onClick={() => openReader(ex.document_id, ex.id)} className="nodrag mt-2 flex w-full items-center gap-1 text-left text-[11px] text-[var(--muted)] hover:text-[var(--accent)]" title="Show in the paper">
          {ex.kind === "area" && <ImageIcon size={11} />}<span className="truncate">{paper} · page {ex.page}</span>
        </button>
        <Text id={id} field="note" value={d.note ?? ""} placeholder="Add a thought…" rows={2} className="mt-1" />
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- note
const NOTE_COLORS = ["#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#e5e7eb"];
export function NoteNode({ id, data, selected }: NodeProps) {
  const { update } = useCanvas();
  const d = data as { title?: string; text?: string; color?: string };
  const color = d.color ?? NOTE_COLORS[0];
  return (
    <Shell id={id} selected={selected} className="w-[240px] !border-black/10" accent={undefined}>
      <div className="rounded-xl p-2 text-slate-800" style={{ background: color }}>
        <Text id={id} field="title" value={d.title ?? ""} placeholder="Title" rows={1} className="!font-semibold !text-slate-900 placeholder:!text-slate-500" />
        <Text id={id} field="text" value={d.text ?? ""} placeholder="Write a note…" rows={4} className="!text-slate-800 placeholder:!text-slate-500" />
        <div className="nodrag flex gap-1 px-1 pt-1">
          {NOTE_COLORS.map((c) => (
            <button key={c} onClick={() => update(id, { color: c })} className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ background: c }} aria-label="Colour" />
          ))}
        </div>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- claim ("My research")
const CLAIM_STATUS = [
  { id: "idea", label: "Idea" },
  { id: "needs", label: "Needs evidence" },
  { id: "supported", label: "Supported" },
  { id: "drafted", label: "In draft" },
];
export function ClaimNode({ id, data, selected }: NodeProps) {
  const { update, snapshot } = useCanvas();
  const d = data as { text?: string; status?: string };
  return (
    <Shell id={id} selected={selected} className="w-[300px] !border-[#7c3aed]/40" accent="#7c3aed">
      <div className="p-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[#7c3aed]"><Target size={13} /> My research</div>
        <Text id={id} field="text" value={d.text ?? ""} placeholder="State your claim or research question…" rows={3} className="!text-[15px] !font-medium" />
        <select value={d.status ?? "idea"} onFocus={snapshot} onChange={(e) => update(id, { status: e.target.value })}
          className="nodrag mt-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs">
          {CLAIM_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- frame
export function FrameNode({ id, data, selected }: NodeProps) {
  const { update, snapshot } = useCanvas();
  const d = data as { title?: string };
  return (
    <>
      <NodeResizer isVisible={!!selected} minWidth={240} minHeight={160} onResizeStart={snapshot} />
      <div className={`h-full w-full rounded-2xl border-2 border-dashed bg-[var(--accent)]/5 ${selected ? "border-[var(--accent)]" : "border-[var(--border-strong)]"}`}>
        <input
          className="nodrag w-full rounded-t-2xl bg-transparent px-4 py-2 text-sm font-semibold outline-none placeholder:text-[var(--subtle)]"
          placeholder="Name this group (e.g. Methods, Related work)" value={d.title ?? ""}
          onFocus={snapshot} onChange={(e) => update(id, { title: e.target.value })}
        />
      </div>
    </>
  );
}

export const nodeTypes = { paper: PaperNode, excerpt: ExcerptNode, note: NoteNode, claim: ClaimNode, frame: FrameNode };
