"use client";

import React, { useEffect, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
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
  // Home can ask for a particular dashboard to open straight away.
  useEffect(() => {
    try { const id = sessionStorage.getItem("resector_open_dashboard"); if (id) { sessionStorage.removeItem("resector_open_dashboard"); setOpenId(id); } } catch { /* storage unavailable */ }
  }, []);
  const [search, setSearch] = useState("");

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

  const shown = (list ?? []).filter((d) => `${d.title} ${d.project}`.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <div className="dashboard-library h-full overflow-y-auto px-6 py-10 sm:px-12 sm:py-14">
      {dialogs}
      <div className="mx-auto max-w-5xl">
        <div className="dashboard-library-hero rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] sm:p-8">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-[var(--tool-dashboards)]">Research workspace</p>
          <h2 className="mt-2 font-serif text-4xl font-semibold leading-tight tracking-tight">Your dashboards</h2>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-[var(--muted)]">One for each project. Put your papers on it, save the passages that matter, and write with your sources beside you.</p>
        </div>

        {list && list.length > 6 && (
          <div className="relative mt-8 max-w-sm">
            <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtle)]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a dashboard" aria-label="Find a dashboard" className="field !h-11 !pl-10" />
          </div>
        )}
        {error && <p role="alert" className="mt-6 text-sm text-[var(--danger)]">{error}</p>}

        {list === null ? (
          <div role="status" aria-label="Loading your dashboards" className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"><div className="skeleton h-40" /><div className="skeleton h-40" /><div className="skeleton h-40" /></div>
        ) : (
          <ul className="dashboard-card-grid mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <li>
              <button onClick={() => setCreating(true)} className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-panel)] border-2 border-dashed border-[var(--border-strong)] p-6 text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-muted)]"><Plus size={24} /></span>
                <span className="text-base font-semibold">New dashboard</span>
              </button>
            </li>
            {shown.map((d) => (
              <li key={d.id} className="group relative">
                <button onClick={() => open(d.id)} className="card flex h-full min-h-40 w-full flex-col p-6 text-left">
                  <span className="line-clamp-2 pr-8 text-lg font-semibold leading-snug">{d.title}</span>
                  {d.project && <span className="mt-1 truncate text-[0.9375rem] text-[var(--muted)]">{d.project}</span>}
                  <span className="mt-auto pt-6 text-sm text-[var(--muted)]">
                    {d.papers} {d.papers === 1 ? "paper" : "papers"} · edited {new Date(d.updated_at).toLocaleDateString()}
                  </span>
                </button>
                <button
                  aria-label={`Delete ${d.title}`} title="Delete this dashboard"
                  onClick={async () => {
                    if (!(await confirm({ title: `Delete “${d.title}”?`, message: "Its papers, saved excerpts and comments will be removed. This can’t be undone.", danger: true }))) return;
                    await dashboardApi.remove(d.id).catch((e) => setError(e.message)); refresh();
                  }}
                  className="icon-btn absolute right-3 top-3 opacity-0 transition-opacity hover:!text-[var(--danger)] focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {list && search && shown.length === 0 && <p className="mt-6 text-[0.9375rem] text-[var(--muted)]">No dashboard matches “{search}”.</p>}
      </div>

      {creating && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setCreating(false)}>
          <form className="anim-pop float w-full max-w-md space-y-5 p-7" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); create(); }}>
            <h3 className="font-serif text-2xl font-semibold">New dashboard</h3>
            <div>
              <label htmlFor="db-title" className="field-label">Name</label>
              <input id="db-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Thesis chapter 2" className="field" />
            </div>
            <div>
              <label htmlFor="db-project" className="field-label">What is it for? <span className="font-normal text-[var(--muted)]">(optional)</span></label>
              <input id="db-project" value={project} onChange={(e) => setProject(e.target.value)} placeholder="A paper, a thesis, a literature review…" className="field" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setCreating(false)} className="btn btn-quiet">Cancel</button>
              <button type="submit" className="btn btn-primary">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
