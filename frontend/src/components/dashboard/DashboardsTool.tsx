"use client";

import React, { useEffect, useState } from "react";
import { LayoutDashboard, Loader2, Plus, Trash2 } from "lucide-react";
import { dashboardApi, type DashboardSummary } from "@/lib/dashboardApi";
import Canvas from "./Canvas";

const LAST = "resector_last_dashboard";

export default function DashboardsTool() {
  const [list, setList] = useState<DashboardSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [error, setError] = useState("");

  const refresh = () => dashboardApi.list().then(setList).catch((e) => { setList([]); setError(e.message || "Could not load your dashboards."); });
  useEffect(() => { refresh(); }, []);

  const open = (id: string | null) => {
    setOpenId(id);
    try { id ? localStorage.setItem(LAST, id) : localStorage.removeItem(LAST); } catch { /* storage unavailable */ }
    if (!id) refresh();
  };

  const create = async () => {
    setError("");
    try { const d = await dashboardApi.create(title, project); setCreating(false); setTitle(""); setProject(""); open(d.id); }
    catch (e: any) { setError(e.message || "Could not create the dashboard."); }
  };

  if (openId) return <div className="h-full"><Canvas dashboardId={openId} onBack={() => open(null)} /></div>;

  return (
    <div className="h-full overflow-y-auto px-6 py-8 sm:px-10">
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Research dashboards</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">One board per project. Lay out your papers, save the passages that matter, and link the ideas that connect.</p>
        </div>
        <button onClick={() => setCreating(true)} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-[var(--accent-contrast)]"><Plus size={15} /> New dashboard</button>
      </div>
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      {creating && (
        <div className="mb-6 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dashboard name, e.g. Thesis chapter 2"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--border-strong)]" />
          <input value={project} onChange={(e) => setProject(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Which paper or project is this for? (optional)"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--border-strong)]" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--surface-muted)]">Cancel</button>
            <button onClick={create} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-contrast)]">Create</button>
          </div>
        </div>
      )}

      {list === null && <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 size={15} className="animate-spin" /> Loading…</div>}
      {list && list.length === 0 && !creating && (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] p-10 text-center">
          <LayoutDashboard size={28} className="mx-auto mb-2 text-[var(--muted)]" />
          <p className="text-sm font-medium">No dashboards yet</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Create one for the paper you are writing, then drop in the PDFs you are reading.</p>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {list?.map((d) => (
          <li key={d.id} className="group relative">
            <button onClick={() => open(d.id)} className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-colors hover:border-[var(--border-strong)]">
              <div className="truncate pr-8 text-sm font-semibold">{d.title}</div>
              {d.project && <div className="mt-0.5 truncate text-xs text-[var(--muted)]">{d.project}</div>}
              <div className="mt-3 text-xs text-[var(--subtle)]">{d.papers} {d.papers === 1 ? "paper" : "papers"} · {d.nodes} cards · updated {new Date(d.updated_at).toLocaleDateString()}</div>
            </button>
            <button aria-label={`Delete ${d.title}`} onClick={async () => {
              if (!window.confirm(`Delete “${d.title}”?\n\nIts papers, saved excerpts and comments will be removed. This can’t be undone.`)) return;
              await dashboardApi.remove(d.id).catch((e) => setError(e.message)); refresh();
            }} className="absolute right-3 top-3 rounded-md p-1.5 text-[var(--subtle)] opacity-0 hover:bg-[var(--surface-muted)] hover:text-[var(--danger)] group-hover:opacity-100">
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}
