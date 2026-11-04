"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { aiConfig, dashboardApi, type CheckFinding, type CheckState } from "@/lib/dashboardApi";
import { openSettings } from "@/lib/errors";
import { formatTokens } from "@/lib/citations";
import { keyOfMarker, resolveKey, type DocLike, type ExcerptLike, type SourceInfo } from "@/lib/drafts";

type Props = {
  dashboardId: string; draftId: number; content: string; saveTick: number;
  docs: DocLike[]; excerpts: ExcerptLike[];
  flushSave: () => Promise<void>;
  onAddCitation: (raw: string, marker: string) => boolean;
  onJump: (raw: string) => void;
  onOpen: (src: SourceInfo) => void;
  onUsageChanged: () => void;
  notify: (text: string, tone?: "info" | "error") => void;
};

const BADGE: Record<string, { label: string; cls: string; Icon: any }> = {
  supported: { label: "Supported", cls: "text-[var(--success)]", Icon: CheckCircle2 },
  partial: { label: "Partly supported", cls: "text-amber-600", Icon: AlertTriangle },
  unsupported: { label: "Not supported", cls: "text-[var(--danger)]", Icon: XCircle },
  contradicted: { label: "Contradicted", cls: "text-[var(--danger)]", Icon: XCircle },
  unchecked: { label: "Could not check", cls: "text-[var(--muted)]", Icon: CircleHelp },
};

/** Checks every cited sentence against the quoted source, and uncited factual-sounding sentences against
 *  your papers. Nothing is changed in the draft unless you press "Add this citation". */
export default function DraftCheck({ dashboardId, draftId, content, saveTick, docs, excerpts, flushSave, onAddCitation, onJump, onOpen, onUsageChanged, notify }: Props) {
  const [state, setState] = useState<CheckState | null>(null);
  const [est, setEst] = useState<{ items: number; skipped: number; calls: number; tokens_in: number; tokens_out: number } | null>(null);
  const [filter, setFilter] = useState<"attention" | "all">("attention");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<number | null>(null);
  const wasRunning = useRef(false);

  const poll = useCallback(async () => {
    try {
      const s = await dashboardApi.checkState(dashboardId, draftId);
      setState(s);
      const running = s.run?.status === "running";
      if (wasRunning.current && !running) onUsageChanged();
      wasRunning.current = running;
      if (running) timer.current = window.setTimeout(poll, 1200);
    } catch (e: any) { setError(e.message || "Could not read the check."); }
  }, [dashboardId, draftId, onUsageChanged]);

  useEffect(() => { setState(null); setError(""); wasRunning.current = false; poll(); return () => { if (timer.current) window.clearTimeout(timer.current); }; }, [poll]);
  useEffect(() => {
    let off = false;
    dashboardApi.checkEstimate(dashboardId, draftId).then((e) => { if (!off) setEst(e); }).catch(() => {});
    return () => { off = true; };
  }, [dashboardId, draftId, saveTick]);

  const running = state?.run?.status === "running";
  const start = async () => {
    if (!aiConfig().api_key) { notify("Add your AI provider key in Settings first.", "error"); openSettings(); return; }
    setStarting(true); setError("");
    try {
      await flushSave();
      await dashboardApi.checkRun(dashboardId, draftId);
      wasRunning.current = true;
      await poll();
    } catch (e: any) { setError(e.message || "Could not start the check."); } finally { setStarting(false); }
  };
  const cancel = async () => { if (state?.run) { try { await dashboardApi.cancelRun(dashboardId, state.run.id); } catch { /* ignore */ } } };

  const result = state?.result;
  const findings = result?.findings ?? [];
  const attention = (f: CheckFinding) => f.verdict !== "supported";
  const shown = findings.filter((f) => filter === "all" || attention(f));
  const stale = !!result && (result.hash !== state?.current_hash || findings.some((f) => !content.includes(f.raw)));
  const counts = result?.counts ?? {};

  const open = (marker: string) => { const k = keyOfMarker(marker); const s = k && resolveKey(k, docs, excerpts); if (s) onOpen(s); };
  const add = (f: CheckFinding) => {
    if (!f.suggest) return;
    if (!onAddCitation(f.raw, f.suggest)) notify("That sentence has changed since the check. Run it again.", "error");
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border border-[var(--border)] p-2.5">
        <p className="flex items-center gap-1.5 text-xs font-medium"><ShieldCheck size={13} className="text-[var(--accent)]" /> Check this draft against your papers</p>
        <p className="mt-1 text-[0.75rem] text-[var(--muted)]">Looks at each cited sentence and each uncited sentence that states a fact, and tells you whether the paper really says it.</p>
        {est && est.items > 0 && !running && (
          <p className="mt-1.5 text-[0.75rem] text-[var(--muted)]">About {est.items} sentence{est.items === 1 ? "" : "s"} · roughly {formatTokens(est.tokens_in + est.tokens_out)} tokens{est.skipped > 0 ? ` · ${est.skipped} more skipped to keep the cost down` : ""}</p>
        )}
        {est && est.items === 0 && <p className="mt-1.5 text-[0.75rem] text-[var(--muted)]">Nothing to check yet. Write some sentences with claims or citations.</p>}
        <div className="mt-2 flex gap-1.5">
          {running ? (
            <button className="btn btn-secondary !py-1.5 !text-xs" onClick={cancel}>Stop</button>
          ) : (
            <button className="btn btn-primary !py-1.5 !text-xs" onClick={start} disabled={starting || !content.trim() || est?.items === 0}>
              {starting && <Loader2 size={12} className="animate-spin" />} {result ? "Check again" : "Check draft"}
            </button>
          )}
        </div>
        {running && state?.run && (
          <p className="mt-2 flex items-center gap-1.5 text-[0.75rem] text-[var(--muted)]"><Loader2 size={11} className="animate-spin" /> Checked {state.run.done} of {state.run.total || "?"} sentences…</p>
        )}
        {state?.run && !running && state.run.status !== "done" && <p className="mt-2 text-[0.75rem] text-[var(--danger)]">{state.run.status === "cancelled" ? "Stopped. " : ""}{state.run.message}</p>}
        {error && <p className="mt-2 text-[0.75rem] text-[var(--danger)]">{error}</p>}
      </div>

      {result && findings.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem]">
            {(["supported", "partial", "unsupported", "contradicted", "unchecked"] as const).filter((k) => counts[k]).map((k) => (
              <span key={k} className={`flex items-center gap-1 ${BADGE[k].cls}`}>{React.createElement(BADGE[k].Icon, { size: 12 })} {counts[k]} {BADGE[k].label.toLowerCase()}</span>
            ))}
          </div>
          {stale && <p className="rounded-md bg-[var(--surface-muted)] p-2 text-[0.75rem] text-[var(--muted)]">The draft has changed since this check. Results for edited sentences are greyed out. Run the check again to refresh.</p>}
          <div className="flex gap-1 text-xs" role="group" aria-label="Show">
            <button className={`btn btn-quiet !px-2 !py-1 !text-[0.75rem] ${filter === "attention" ? "!bg-[var(--surface-strong)]" : ""}`} onClick={() => setFilter("attention")}>Needs attention</button>
            <button className={`btn btn-quiet !px-2 !py-1 !text-[0.75rem] ${filter === "all" ? "!bg-[var(--surface-strong)]" : ""}`} onClick={() => setFilter("all")}>All</button>
          </div>
          {shown.length === 0 && <p className="text-xs text-[var(--muted)]">Everything checked is supported by your papers.</p>}
          <ul className="space-y-2">
            {shown.map((f) => {
              const b = BADGE[f.verdict] ?? BADGE.unchecked;
              const here = content.includes(f.raw);
              return (
                <li key={f.idx} className={`rounded-lg border border-[var(--border)] p-2 ${here ? "" : "opacity-50"}`}>
                  <p className={`flex items-center gap-1 text-[0.75rem] font-medium ${b.cls}`}>{React.createElement(b.Icon, { size: 12 })} {b.label}{!f.cited && " · no citation"}</p>
                  <button className="mt-1 block w-full text-left text-xs hover:underline" disabled={!here} onClick={() => onJump(f.raw)} title="Go to this sentence">“{f.sentence.length > 180 ? f.sentence.slice(0, 180) + "…" : f.sentence}”</button>
                  {f.reason && <p className="mt-1 text-[0.75rem] text-[var(--muted)]">{f.reason}</p>}
                  {f.sources.slice(0, 2).map((s, i) => (
                    <button key={i} className="mt-1 block w-full truncate text-left text-[0.75rem] text-[var(--accent)] hover:underline" onClick={() => open(s.marker)} title={s.quote}>
                      {s.filename}{s.page ? `, p.${s.page}` : ""}
                    </button>
                  ))}
                  {here && f.suggest && !f.cited && (
                    <button className="btn btn-primary mt-1.5 !px-2 !py-1 !text-[0.75rem]" onClick={() => add(f)}>Add this citation</button>
                  )}
                  {!f.cited && f.verdict === "unsupported" && <p className="mt-1 text-[0.75rem] text-[var(--muted)]">Add a source for this, or soften the claim.</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {result && findings.length === 0 && state?.run?.status === "done" && <p className="text-xs text-[var(--muted)]">{state.run.message}</p>}
    </div>
  );
}
