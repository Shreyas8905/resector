"use client";

import React, { useEffect, useMemo, useState } from "react";
import { History, Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import { dashboardApi, type VersionInfo } from "@/lib/dashboardApi";
import { diffLines, diffSummary } from "@/lib/drafts";

type Props = {
  dashboardId: string; draftId: number; content: string; refreshKey: number;
  flushSave: () => Promise<void>;
  onRestored: (content: string) => void;
  confirm: (o: { title: string; message?: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  ask: (o: { title: string; label?: string; initial?: string; confirmLabel?: string }) => Promise<string | null>;
};

const KIND: Record<string, string> = { auto: "Automatic", manual: "Saved", autopilot: "Before autopilot", restore: "Before restore" };

export default function DraftVersions({ dashboardId, draftId, content, refreshKey, flushSave, onRestored, confirm, ask }: Props) {
  const [list, setList] = useState<VersionInfo[]>([]);
  const [open, setOpen] = useState<VersionInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try { setList(await dashboardApi.versions(dashboardId, draftId)); setError(""); }
    catch (e: any) { setError(e.message || "Could not load versions."); }
  };
  useEffect(() => { setOpen(null); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [draftId, refreshKey]);

  const ops = useMemo(() => (open?.content != null ? diffLines(open.content, content) : []), [open, content]);
  const sum = diffSummary(ops);

  const save = async () => {
    const label = await ask({ title: "Save this version", label: "Name (optional)", initial: "", confirmLabel: "Save" });
    if (label === null) return;
    setBusy(true);
    try { await flushSave(); await dashboardApi.saveVersion(dashboardId, draftId, label); await load(); }
    catch (e: any) { setError(e.message || "Could not save."); } finally { setBusy(false); }
  };
  const view = async (v: VersionInfo) => {
    if (open?.id === v.id) { setOpen(null); return; }
    try { setOpen(await dashboardApi.version(dashboardId, draftId, v.id)); } catch (e: any) { setError(e.message || "Could not open it."); }
  };
  const restore = async (v: VersionInfo) => {
    if (!(await confirm({ title: "Restore this version?", message: "Your current text is kept as a version first, so you can come back to it.", confirmLabel: "Restore" }))) return;
    setBusy(true);
    try { await flushSave(); const d = await dashboardApi.restoreVersion(dashboardId, draftId, v.id); onRestored(d.content); setOpen(null); await load(); }
    catch (e: any) { setError(e.message || "Could not restore."); } finally { setBusy(false); }
  };
  const remove = async (v: VersionInfo) => {
    try { await dashboardApi.deleteVersion(dashboardId, draftId, v.id); if (open?.id === v.id) setOpen(null); await load(); }
    catch (e: any) { setError(e.message || "Could not delete."); }
  };

  return (
    <div className="space-y-3 text-sm">
      <button className="btn btn-secondary w-full !py-1.5 !text-xs" onClick={save} disabled={busy}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save a version now
      </button>
      <p className="text-[11px] text-[var(--muted)]">Versions are also kept automatically while you write, and before autopilot or a restore.</p>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      {list.length === 0 && <p className="flex items-center gap-1.5 text-xs text-[var(--muted)]"><History size={13} /> No earlier versions yet.</p>}
      <ul className="space-y-1.5">
        {list.map((v) => (
          <li key={v.id} className={`rounded-lg border p-2 ${open?.id === v.id ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
            <button className="block w-full text-left" onClick={() => view(v)}>
              <span className="block text-xs font-medium">{v.label && v.kind !== "auto" ? v.label : KIND[v.kind] ?? v.kind}</span>
              <span className="block text-[11px] text-[var(--muted)]">{new Date(v.created_at).toLocaleString()} · {v.words} words</span>
            </button>
            {open?.id === v.id && (
              <div className="mt-2">
                <p className="mb-1 text-[11px] text-[var(--muted)]">Changes since this version: <span className="text-[var(--success)]">+{sum.added} lines added</span> · <span className="text-[var(--danger)]">−{sum.removed} lines removed</span></p>
                <div className="max-h-56 overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-1.5 font-mono text-[11px] leading-snug">
                  {ops.every((o) => o.type === "same") ? <p className="p-1 text-[var(--muted)]">Identical to your current text.</p> :
                    ops.map((o, i) => o.type === "same"
                      ? <div key={i} className="truncate px-1 text-[var(--subtle)]">{o.text || " "}</div>
                      : <div key={i} className={`whitespace-pre-wrap px-1 ${o.type === "add" ? "bg-[color-mix(in_srgb,var(--success)_14%,transparent)]" : "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"}`}>{o.type === "add" ? "+ " : "− "}{o.text || " "}</div>)}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <button className="btn btn-primary !px-2 !py-1 !text-[11px]" onClick={() => restore(v)} disabled={busy}><RotateCcw size={11} /> Restore</button>
                  <button className="btn btn-quiet !px-2 !py-1 !text-[11px]" onClick={() => remove(v)}><Trash2 size={11} /> Delete</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
