"use client";

import React, { useEffect, useState } from "react";
import { Copy, Loader2, Sparkles, Square, Telescope, X } from "lucide-react";
import { aiConfig, dashboardApi, type AgentState, type Cite, type Suggestion } from "@/lib/dashboardApi";
import { formatTokens } from "@/lib/citations";
import { RELATION_LABEL, VERDICT_LABEL } from "@/lib/wiring";
import ErrorNotice from "@/components/ErrorNotice";
import { EDGE_KINDS } from "./context";
import { ResizeHandle, panelStyle, usePanelWidth } from "@/components/ui/Resizable";

const VERDICT_COLOR: Record<string, string> = {
  supported: "#16a34a", partly: "#d97706", contradicted: "#dc2626", not_covered: "#64748b",
};

export default function ConnectionsPanel({ dashboardId, agent, paperCount, claimCount, nameOf, beforeRun, onStarted, onFocus, onAccept, onDismiss, onCite, onClose }: {
  dashboardId: string; agent: AgentState | null; paperCount: number; claimCount: number;
  nameOf: (kind: string, ref: string) => string; beforeRun: () => Promise<void>;
  onStarted: () => void; onFocus: (s: Suggestion) => void; onAccept: (s: Suggestion) => void;
  onDismiss: (s: Suggestion) => void; onCite: (c: Cite) => void; onClose: () => void;
}) {
  const panel = usePanelWidth("dash_connections", 330, 280, 560);
  const [includeClaims, setIncludeClaims] = useState(true);
  const [maxPairs, setMaxPairs] = useState(12);
  const [est, setEst] = useState<{ calls: number; tokens: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [starting, setStarting] = useState(false);
  const running = agent?.running ?? null;
  const pending = (agent?.suggestions ?? []).filter((s) => s.status === "pending");
  const accepted = (agent?.suggestions ?? []).filter((s) => s.status === "accepted").length;
  const noKey = !aiConfig().api_key;

  useEffect(() => {
    let off = false;
    dashboardApi.wireEstimate(dashboardId, includeClaims, maxPairs)
      .then((e) => !off && setEst({ calls: e.calls, tokens: e.tokens_in + e.tokens_out })).catch(() => {});
    return () => { off = true; };
  }, [dashboardId, includeClaims, maxPairs, paperCount, claimCount, agent?.runs?.[0]?.status]);

  const start = async (kind: "wire" | "gaps", rerun = false) => {
    setError(null); setStarting(true);
    try {
      await beforeRun();
      if (kind === "wire") await dashboardApi.wireRun(dashboardId, { include_claims: includeClaims, max_pairs: maxPairs, rerun });
      else await dashboardApi.gapsRun(dashboardId);
      onStarted();
    } catch (e) { setError(e); } finally { setStarting(false); }
  };

  return (
    <aside style={panelStyle(panel.width)} className="anim-slide-in relative flex w-80 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)] md:w-[var(--panel-w)]">
      <ResizeHandle panel={panel} edge="left" label="Resize the Connections panel" />
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span className="text-sm font-semibold">Connections</span>
        <button className="icon-btn !h-8 !w-8" onClick={onClose} aria-label="Close"><X size={15} /></button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        {/* find connections */}
        <section className="space-y-2">
          <p className="text-xs text-[var(--muted)]">The assistant reads your papers and proposes links between them, and between your own claims and the papers. Nothing is added until you say so, and every suggestion quotes its evidence.</p>
          {noKey && <p className="rounded-md bg-[var(--surface-muted)] p-2 text-xs text-[var(--muted)]">Add your AI provider key in Settings first.</p>}
          {running ? (
            <div className="rounded-[var(--radius-control)] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-2.5 text-xs">
              <p className="flex items-center gap-1.5 font-medium"><Loader2 size={12} className="animate-spin" /> {running.kind === "wire" ? "Looking for connections" : "Checking your claims"}… {running.done} of {running.total || "?"}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-strong)]">
                <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${running.total ? (running.done / running.total) * 100 : 5}%` }} />
              </div>
              <button className="btn btn-secondary mt-2 !py-1 !text-xs" onClick={() => dashboardApi.cancelRun(dashboardId, running.id)}><Square size={11} /> Stop</button>
            </div>
          ) : (
            <>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={includeClaims} onChange={(e) => setIncludeClaims(e.target.checked)} /> Also check my “My research” claims{claimCount ? ` (${claimCount})` : ""}</label>
              <label className="flex items-center gap-2 text-xs">Check up to
                <select className="field !w-auto !py-1 !text-xs" value={maxPairs} onChange={(e) => setMaxPairs(Number(e.target.value))}>
                  {[6, 12, 20, 40].map((n) => <option key={n} value={n}>{n}</option>)}
                </select> pairs of papers, closest first
              </label>
              <button className="btn btn-primary w-full" disabled={starting || paperCount < 2 || noKey} onClick={() => start("wire")}>
                {starting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Find connections
              </button>
              {paperCount < 2 && <p className="text-[11px] text-[var(--muted)]">Add at least two papers that have finished reading.</p>}
              {est && est.calls > 0 && <p className="text-[11px] text-[var(--subtle)]">About {est.calls} checks, roughly {formatTokens(est.tokens)} tokens from your AI provider.</p>}
              {est && est.calls === 0 && paperCount >= 2 && <p className="text-[11px] text-[var(--subtle)]">Every pair has already been checked. <button className="underline" onClick={() => start("wire", true)}>Check again</button></p>}
            </>
          )}
          {error != null && <ErrorNotice error={error} />}
        </section>

        {/* suggestions */}
        <section>
          <h3 className="mb-1.5 text-xs font-semibold">Waiting for your decision ({pending.length})</h3>
          {pending.length === 0 && <p className="text-xs text-[var(--muted)]">{accepted ? `${accepted} link${accepted === 1 ? "" : "s"} added so far. ` : ""}No suggestions waiting.</p>}
          <ul className="space-y-1.5">
            {pending.map((s) => {
              const color = EDGE_KINDS.find((k) => k.id === s.relation)?.color ?? "#94a3b8";
              return (
                <li key={s.id} className="rounded-lg border border-[var(--border)] p-2 text-xs">
                  <button className="block w-full text-left" onClick={() => onFocus(s)}>
                    <span className="font-medium" style={{ color }}>{RELATION_LABEL[s.relation]}</span>
                    <span className="text-[var(--muted)]"> · {nameOf(s.a_kind, s.a_ref)} → {nameOf(s.b_kind, s.b_ref)}</span>
                    <span className="mt-0.5 line-clamp-2 block">{s.summary}</span>
                  </button>
                  <div className="mt-1.5 flex gap-1">
                    <button className="btn btn-secondary !px-2 !py-0.5 !text-[11px]" onClick={() => onAccept(s)}>Add link</button>
                    <button className="btn btn-quiet !px-2 !py-0.5 !text-[11px]" onClick={() => onDismiss(s)}>Dismiss</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* gaps */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold">Gaps in my evidence</h3>
          <p className="text-xs text-[var(--muted)]">For each “My research” card, how well do your papers back it, and what is missing?</p>
          <button className="btn btn-secondary w-full" disabled={!!running || starting || claimCount === 0 || paperCount === 0 || noKey} onClick={() => start("gaps")}>
            <Telescope size={14} /> Check my claims
          </button>
          {claimCount === 0 && <p className="text-[11px] text-[var(--muted)]">Add a “My research” card first.</p>}
          {(agent?.gaps?.result ?? []).map((g) => (
            <div key={g.node_id} className="rounded-lg border border-[var(--border)] p-2.5 text-xs">
              <p className="font-medium">“{g.claim.length > 120 ? g.claim.slice(0, 120) + "…" : g.claim}”</p>
              <p className="mt-1"><span className="rounded-full px-2 py-0.5 font-medium text-white" style={{ background: VERDICT_COLOR[g.verdict] }}>{VERDICT_LABEL[g.verdict]}</span></p>
              {g.missing && <p className="mt-1.5"><span className="font-medium">Missing: </span>{g.missing}</p>}
              {[...g.supporting.map((c) => ({ c, t: "For" })), ...g.contradicting.map((c) => ({ c, t: "Against" }))].map(({ c, t }) => (
                <button key={`${t}${c.n}`} className="mt-1.5 block w-full rounded-md bg-[var(--surface-muted)] px-2 py-1 text-left text-[var(--muted)] hover:text-[var(--foreground)]" onClick={() => onCite(c)}>
                  <span className="font-medium text-[var(--foreground)]">{t}: {(c.filename || "").replace(/\.pdf$/i, "")}{c.page ? `, p.${c.page}` : ""}</span>
                  <span className="line-clamp-2 block italic">{c.quote}</span>
                </button>
              ))}
              {g.search && (
                <button className="mt-1.5 flex items-center gap-1 text-[var(--accent)] hover:underline" onClick={() => navigator.clipboard?.writeText(g.search)} title="Copy a search query for Google Scholar or your library">
                  <Copy size={11} /> Search for: {g.search}
                </button>
              )}
            </div>
          ))}
        </section>

        {/* activity */}
        <section>
          <h3 className="mb-1.5 text-xs font-semibold">Activity</h3>
          {(agent?.runs ?? []).length === 0 && <p className="text-xs text-[var(--muted)]">Nothing has run yet.</p>}
          <ul className="space-y-1">
            {(agent?.runs ?? []).map((r) => (
              <li key={r.id} className="rounded-md bg-[var(--surface-muted)] px-2 py-1.5 text-[11px] text-[var(--muted)]">
                <span className="font-medium text-[var(--foreground)]">{r.kind === "wire" ? "Find connections" : "Check claims"}</span> · {r.status === "done" ? "finished" : r.status === "cancelled" ? "stopped" : r.status === "failed" ? "failed" : "running"} · {new Date(r.created_at).toLocaleString()}
                {r.message && <span className="block">{r.message}</span>}
                {(r.tokens_in + r.tokens_out) > 0 && <span className="block">{formatTokens(r.tokens_in + r.tokens_out)} tokens</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
