"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { dashboardApi, type TableRow } from "@/lib/dashboardApi";
import { formatTokens } from "@/lib/citations";
import ErrorNotice from "@/components/ErrorNotice";

export const DEFAULT_COLUMNS = ["Research question", "Method", "Data", "Key result", "Limitations"];

type Props = {
  dashboardId: string;
  papers: { id: number; name: string }[];
  preselected: number[];
  onClose: () => void;
  onDone: (columns: string[], rows: TableRow[]) => void;
  onUsageChanged: () => void;
};

export default function CompareDialog({ dashboardId, papers, preselected, onClose, onDone, onUsageChanged }: Props) {
  const [picked, setPicked] = useState<Set<number>>(new Set(preselected.length >= 2 ? preselected : papers.map((p) => p.id).slice(0, 4)));
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [newCol, setNewCol] = useState("");
  const [est, setEst] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, name: "" });
  const [rows, setRows] = useState<TableRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (picked.size === 0) { setEst(null); return; }
    let off = false;
    dashboardApi.estimate(dashboardId, "compare", Array.from(picked), columns.length)
      .then((e) => !off && setEst(e.tokens_in + e.tokens_out)).catch(() => !off && setEst(null));
    return () => { off = true; };
  }, [dashboardId, picked, columns.length]);

  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const addCol = () => {
    const c = newCol.trim().slice(0, 60);
    if (c && !columns.some((x) => x.toLowerCase() === c.toLowerCase()) && columns.length < 8) setColumns([...columns, c]);
    setNewCol("");
  };

  const run = async () => {
    const ids = papers.map((p) => p.id).filter((id) => picked.has(id));
    cancelled.current = false; setRunning(true); setError(null); setRows([]);
    const done: TableRow[] = [];
    try {
      for (let i = 0; i < ids.length; i++) {
        if (cancelled.current) break;
        const name = papers.find((p) => p.id === ids[i])?.name ?? "paper";
        setProgress({ done: i, total: ids.length, name });
        const r = await dashboardApi.compareRow(dashboardId, ids[i], columns);
        done.push({ document_id: r.document_id, filename: r.filename, cells: r.cells });
        setRows([...done]);
        onUsageChanged();
      }
      if (done.length) onDone(columns, done);
      if (!cancelled.current) onClose();
    } catch (e) {
      setError(e);
    } finally { setRunning(false); }
  };

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => !running && onClose()}>
      <div className="anim-pop flex max-h-[88vh] w-full max-w-xl flex-col rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-pop)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-[var(--border)] p-4">
          <div>
            <h3 className="text-sm font-semibold">Compare papers in a table</h3>
            <p className="mt-0.5 text-xs text-[var(--muted)]">Each cell is filled from the paper’s own text and links back to its page.</p>
          </div>
          {!running && <button className="icon-btn !h-8 !w-8" onClick={onClose} aria-label="Close"><X size={15} /></button>}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <p className="field-label">Papers</p>
            {papers.length < 2 && <p className="text-xs text-[var(--muted)]">Add at least two papers (and wait for them to finish reading).</p>}
            {papers.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-muted)]">
                <input type="checkbox" checked={picked.has(p.id)} disabled={running} onChange={() => toggle(p.id)} />
                <span className="truncate">{p.name}</span>
              </label>
            ))}
          </div>
          <div>
            <p className="field-label">What to compare</p>
            <div className="flex flex-wrap gap-1.5">
              {columns.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] py-0.5 pl-2.5 pr-1 text-xs">
                  {c}
                  {!running && columns.length > 1 && (
                    <button onClick={() => setColumns(columns.filter((x) => x !== c))} className="rounded-full p-0.5 text-[var(--muted)] hover:text-[var(--danger)]" aria-label={`Remove ${c}`}><X size={11} /></button>
                  )}
                </span>
              ))}
            </div>
            {columns.length < 8 && !running && (
              <div className="mt-2 flex gap-2">
                <input className="field !py-1.5" value={newCol} onChange={(e) => setNewCol(e.target.value)} placeholder="Add your own, e.g. Sample size"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCol(); } }} />
                <button className="btn btn-secondary" onClick={addCol} disabled={!newCol.trim()}><Plus size={14} /> Add</button>
              </div>
            )}
          </div>
          {running && (
            <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-muted)] p-3 text-xs text-[var(--muted)]">
              <Loader2 size={14} className="animate-spin" />
              Reading paper {progress.done + 1} of {progress.total}: <span className="truncate text-[var(--foreground)]">{progress.name}</span>
            </div>
          )}
          {error != null && (
            <div className="space-y-2">
              <ErrorNotice error={error} />
              {rows.length > 0 && <button className="btn btn-secondary" onClick={() => { onDone(columns, rows); onClose(); }}>Add the {rows.length} finished {rows.length === 1 ? "row" : "rows"} to the canvas</button>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] p-3">
          <span className="text-[11px] text-[var(--subtle)]">{est ? `Uses about ${formatTokens(est)} tokens from your AI provider.` : ""}</span>
          <div className="flex gap-2">
            {running
              ? <button className="btn btn-secondary" onClick={() => { cancelled.current = true; }}>Stop after this paper</button>
              : <button className="btn btn-quiet" onClick={onClose}>Cancel</button>}
            <button className="btn btn-primary" disabled={running || picked.size < 2 || columns.length === 0} onClick={run}>Build table</button>
          </div>
        </div>
      </div>
    </div>
  );
}
