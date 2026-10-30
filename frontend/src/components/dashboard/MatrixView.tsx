"use client";

import React, { useMemo, useState } from "react";
import type { Cite, DocInfo, Suggestion } from "@/lib/dashboardApi";
import { buildMatrix } from "@/lib/wiring";
import { EDGE_KINDS } from "./context";
import SuggestionCard from "./SuggestionCard";

/** Papers (and your claims) against papers. A filled dot is a link you accepted; a ring is a suggestion. */
export default function MatrixView({ docs, claims, suggestions, onAccept, onDismiss, onCite }: {
  docs: DocInfo[]; claims: { id: string; text: string }[]; suggestions: Suggestion[];
  onAccept: (s: Suggestion) => void; onDismiss: (s: Suggestion) => void; onCite: (c: Cite) => void;
}) {
  const ready = docs.filter((d) => d.status === "completed");
  const m = useMemo(() => buildMatrix(ready.map((d) => d.id), claims.map((c) => c.id), suggestions), [ready, claims, suggestions]);
  const [open, setOpen] = useState<{ row: string; col: string } | null>(null);
  const name = (d: DocInfo) => d.filename.replace(/\.pdf$/i, "");
  const label = (row: string) => {
    if (row.startsWith("claim:")) return claims.find((c) => c.id === row.slice(6))?.text.slice(0, 60) || "My research";
    return name(docs.find((d) => String(d.id) === row.slice(6))!);
  };
  const sel = open ? m.cells.get(`${open.row}|${open.col}`) : null;

  if (ready.length < 2) return <p className="p-8 text-sm text-[var(--muted)]">Add at least two papers to see how they relate.</p>;
  return (
    <div className="min-h-0 flex-1 overflow-auto p-5">
      <p className="mb-3 max-w-2xl text-xs text-[var(--muted)]">Each dot is a relationship between a row and a column. Filled dots are links you accepted; rings are suggestions waiting for your decision. Empty cells mean nothing has been found yet, not that nothing exists.</p>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
        {EDGE_KINDS.filter((k) => k.id !== "cites" && k.id !== "custom" && k.id !== "related").map((k) => (
          <span key={k.id} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: k.color }} />{k.label}</span>
        ))}
      </div>
      <div className="inline-block rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[var(--surface)] p-2" />
              {ready.map((d) => (
                <th key={d.id} className="max-w-[120px] border-b border-[var(--border)] p-2 text-left align-bottom font-medium"><span className="line-clamp-3">{name(d)}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.rows.map((row) => (
              <tr key={row}>
                <th className={`sticky left-0 max-w-[200px] border-t border-[var(--border)] bg-[var(--surface)] p-2 text-left font-medium ${row.startsWith("claim:") ? "text-[#7c3aed]" : ""}`}>
                  <span className="line-clamp-2">{label(row)}</span>
                </th>
                {ready.map((d) => {
                  const c = m.cells.get(`${row}|${d.id}`);
                  const self = row === `paper:${d.id}`;
                  const color = c ? EDGE_KINDS.find((k) => k.id === c.suggestion.relation)?.color ?? "#94a3b8" : undefined;
                  const active = open?.row === row && open.col === String(d.id);
                  return (
                    <td key={d.id} className={`h-11 w-24 border-l border-t border-[var(--border)] text-center ${self ? "bg-[var(--surface-muted)]" : ""} ${active ? "bg-[var(--accent-soft)]" : ""}`}>
                      {c && (
                        <button className="mx-auto flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--surface-muted)]"
                          onClick={() => setOpen(active ? null : { row, col: String(d.id) })} title={c.suggestion.summary} aria-label={c.suggestion.summary}>
                          <span className="h-3.5 w-3.5 rounded-full" style={c.suggestion.status === "accepted" ? { background: color } : { border: `2px solid ${color}` }} />
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && sel && (
        <div className="mt-4">
          <SuggestionCard
            s={sel.suggestion}
            aName={label(`${sel.suggestion.a_kind}:${sel.suggestion.a_ref}`)} bName={label(`${sel.suggestion.b_kind}:${sel.suggestion.b_ref}`)}
            onAccept={() => { onAccept(sel.suggestion); setOpen(null); }} onDismiss={() => { onDismiss(sel.suggestion); setOpen(null); }}
            onCite={onCite} onClose={() => setOpen(null)}
          />
        </div>
      )}
    </div>
  );
}
