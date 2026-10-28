"use client";

import React, { useEffect, useState } from "react";
import { LayoutDashboard, Loader2, Plus, Trash2 } from "lucide-react";
import { dashboardApi, type DashboardSummary } from "@/lib/dashboardApi";
import Canvas from "./Canvas";
import { useDialogs } from "@/components/ui/Dialogs";

const LAST = "resector_last_dashboard";

export default function DashboardsTool() {
  const { confirm, dialogs } = useDialogs();
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
    <div className="h-full overflow-y-auto px-5 py-8 sm:px-10 sm:py-10">
      {dialogs}
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-start justify-between gap-4 border-b border-[var(--border)] pb-6">
          <div>
            <h2 className="font-serif text-[1.75rem] font-semibold leading-tight tracking-tight">Research dashboards</h2>
            <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-[var(--muted)]">
              One board per project. Lay out your papers, save the passages that matter, and link the ideas that connect.
            </p>
          </div>
          <button onClick={() => setCreating(true)} className="btn btn-primary shrink-0">
            <Plus size={15} /> New dashboard
          </button>
        </div>
        {error && <p role="alert" className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

        {creating && (
          <form
            className="anim-pop mb-6 space-y-3 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-5"
            onSubmit={(e) => { e.preventDefault(); create(); }}
          >
            <div>
              <label htmlFor="db-title" className="field-label">Dashboard name</label>
              <input id="db-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Thesis chapter 2" className="field" />
            </div>
            <div>
              <label htmlFor="db-project" className="field-label">Paper or project <span className="font-normal text-[var(--muted)]">(optional)</span></label>
              <input id="db-project" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Which paper or project is this for?" className="field" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="btn btn-quiet">Cancel</button>
              <button type="submit" className="btn btn-primary">Create dashboard</button>
            </div>
          </form>
        )}

        {list === null && <div role="status" className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 size={15} className="animate-spin" /> Loading your dashboards…</div>}
        {list && list.length === 0 && !creating && (
          <div className="rounded-[var(--radius-panel)] border border-dashed border-[var(--border-strong)] px-6 py-12 text-center">
            <LayoutDashboard size={26} className="mx-auto mb-3 text-[var(--accent)]" />
            <p className="text-sm font-semibold">No dashboards yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--muted)]">Create one for the paper you are writing, then drop in the PDFs you are reading.</p>
            <button onClick={() => setCreating(true)} className="btn btn-primary mt-5"><Plus size={15} /> New dashboard</button>
          </div>
        )}
        <ul className="grid gap-4 sm:grid-cols-2">
          {list?.map((d) => (
            <li key={d.id} className="group relative">
              <button onClick={() => open(d.id)} className="flex h-full w-full flex-col rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-5 text-left transition-colors hover:border-[var(--accent)]">
                <span className="truncate pr-8 text-[15px] font-semibold">{d.title}</span>
                {d.project && <span className="mt-0.5 truncate text-[13px] text-[var(--muted)]">{d.project}</span>}
                <span className="mt-auto pt-5 text-xs text-[var(--subtle)]">
                  {d.papers} {d.papers === 1 ? "paper" : "papers"} · {d.nodes} cards · updated {new Date(d.updated_at).toLocaleDateString()}
                </span>
              </button>
              <button
                aria-label={`Delete ${d.title}`}
                onClick={async () => {
                  if (!(await confirm({ title: `Delete “${d.title}”?`, message: "Its papers, saved excerpts and comments will be removed. This can’t be undone.", danger: true }))) return;
                  await dashboardApi.remove(d.id).catch((e) => setError(e.message)); refresh();
                }}
                className="absolute right-3 top-3 rounded-md p-1.5 text-[var(--subtle)] opacity-0 transition-opacity hover:bg-[var(--surface-muted)] hover:text-[var(--danger)] focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
