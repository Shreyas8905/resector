"use client";

import React from "react";
import { Check, X } from "lucide-react";
import type { Cite, Suggestion } from "@/lib/dashboardApi";
import { EDGE_KINDS } from "./context";
import { RELATION_LABEL } from "@/lib/wiring";

/** One suggested link: what the agent thinks, the quotes it relied on (click to open the paper),
 *  and Accept / Dismiss. Used on the canvas and in the matrix. */
export default function SuggestionCard({ s, aName, bName, onAccept, onDismiss, onCite, onClose }: {
  s: Suggestion; aName: string; bName: string;
  onAccept?: () => void; onDismiss?: () => void; onCite: (c: Cite) => void; onClose?: () => void;
}) {
  const color = EDGE_KINDS.find((k) => k.id === s.relation)?.color ?? "#94a3b8";
  return (
    <div className="anim-pop w-[26rem] max-w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-pop)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium" style={{ borderColor: color, color }}>
            {RELATION_LABEL[s.relation] ?? s.relation}
          </span>
          <span className="ml-2 text-[var(--muted)]">{Math.round(s.confidence * 100)}% sure</span>
          <p className="mt-1.5 truncate text-[var(--muted)]" title={`${aName} → ${bName}`}>{aName} → {bName}</p>
        </div>
        {onClose && <button className="icon-btn !h-7 !w-7" onClick={onClose} aria-label="Close"><X size={14} /></button>}
      </div>
      <p className="mt-2 text-sm leading-snug">{s.summary}</p>
      {s.evidence.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {s.evidence.map((c) => (
            <li key={`${c.document_id}-${c.n}`}>
              <button onClick={() => onCite(c)} className="w-full rounded-md bg-[var(--surface-muted)] px-2 py-1.5 text-left text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
                <span className="font-medium text-[var(--foreground)]">{(c.filename || "Paper").replace(/\.pdf$/i, "")}{c.page ? `, page ${c.page}` : ""}</span>
                <span className="mt-0.5 line-clamp-3 block italic">{c.quote}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-[var(--subtle)]">Suggested by AI from the quoted text. Check the source before you rely on it.</p>
      {s.status === "pending" && (onAccept || onDismiss) && (
        <div className="mt-2.5 flex gap-2">
          {onAccept && <button className="btn btn-primary !py-1.5 !text-xs" onClick={onAccept}><Check size={13} /> Add this link</button>}
          {onDismiss && <button className="btn btn-quiet !py-1.5 !text-xs" onClick={onDismiss}>Not related</button>}
        </div>
      )}
    </div>
  );
}
