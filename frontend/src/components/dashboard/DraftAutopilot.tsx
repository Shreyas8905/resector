"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { aiConfig, dashboardApi, type OutlineSection } from "@/lib/dashboardApi";
import { openSettings } from "@/lib/errors";
import { formatTokens } from "@/lib/citations";
import { appendBlock, sectionBlock } from "@/lib/drafts";

type Written = { heading: string; text: string; uncited: boolean; error?: string; keep: boolean };
type Props = {
  dashboardId: string; papers: { id: number; name: string }[]; content: string;
  /** Other drafts on this dashboard whose text the AI may read for consistency. */
  contextDraftIds?: number[];
  onApply: (blocks: string) => Promise<void>;
  onUsageChanged: () => void;
  confirm: (o: { title: string; message?: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  notify: (text: string, tone?: "info" | "error") => void;
};

const LENGTHS = [{ id: 130, label: "Short" }, { id: 220, label: "Medium" }, { id: 350, label: "Long" }];

/** Plan an outline from your canvas, then write it section by section from your papers. You review everything
 *  before it goes into the draft, and the draft is saved as a version first so autopilot can always be undone. */
export default function DraftAutopilot({ dashboardId, papers, content, contextDraftIds, onApply, onUsageChanged, confirm, notify }: Props) {
  const [instruction, setInstruction] = useState("");
  const [scope, setScope] = useState<number[]>([]);          // empty = every paper
  const [words, setWords] = useState(220);
  const [sections, setSections] = useState<OutlineSection[]>([]);
  const [planning, setPlanning] = useState(false);
  const [writing, setWriting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [written, setWritten] = useState<Written[]>([]);
  const [est, setEst] = useState<{ tokens_in: number; tokens_out: number } | null>(null);
  const [error, setError] = useState("");
  const cancel = useRef(false);

  const live = sections.filter((s) => s.heading.trim());
  useEffect(() => {
    if (!live.length) { setEst(null); return; }
    let off = false;
    dashboardApi.autopilotEstimate(dashboardId, live.length, words).then((e) => { if (!off) setEst(e); }).catch(() => {});
    return () => { off = true; };
  }, [dashboardId, live.length, words]);

  const needKey = () => { if (!aiConfig().api_key) { notify("Add your AI provider key in Settings first.", "error"); openSettings(); return true; } return false; };
  const docIds = scope.length ? scope : undefined;

  const plan = async () => {
    if (needKey()) return;
    setPlanning(true); setError("");
    try {
      const r = await dashboardApi.outline(dashboardId, instruction, docIds, contextDraftIds?.length ? contextDraftIds : undefined);
      setSections(r.sections); setWritten([]); onUsageChanged();
    } catch (e: any) { setError(e.message || "Could not plan an outline."); } finally { setPlanning(false); }
  };

  const write = async () => {
    if (needKey() || !live.length) return;
    cancel.current = false; setWriting(true); setError(""); setWritten([]); setProgress(0);
    let soFar = content;
    const out: Written[] = [];
    for (let i = 0; i < live.length; i++) {
      if (cancel.current) break;
      setProgress(i);
      try {
        const r = await dashboardApi.writeSection(dashboardId, {
          heading: live[i].heading, goal: live[i].goal, instruction, document_ids: docIds, draft_text: soFar, words, context_draft_ids: contextDraftIds?.length ? contextDraftIds : undefined,
        });
        out.push({ heading: live[i].heading, text: r.text, uncited: r.uncited, keep: true });
        soFar = appendBlock(soFar, sectionBlock(live[i].heading, r.text));
        setWritten([...out]);
        onUsageChanged();
      } catch (e: any) {
        out.push({ heading: live[i].heading, text: "", uncited: false, error: e.message || "Could not write this section.", keep: false });
        setWritten([...out]);
        break;                                            // a limit or a missing key will fail the next one too
      }
    }
    setWriting(false); setProgress(live.length);
  };

  const apply = async () => {
    const keep = written.filter((w) => w.keep && w.text.trim());
    if (!keep.length) return;
    const ok = !content.trim() || await confirm({
      title: `Add ${keep.length} section${keep.length === 1 ? "" : "s"} to your draft?`,
      message: "Your draft is saved as a version first, so you can undo this from the Versions tab.", confirmLabel: "Add to draft" });
    if (!ok) return;
    await onApply(keep.map((w) => sectionBlock(w.heading, w.text)).join("\n"));
    setWritten([]); setSections([]);
    notify("Added to your draft. Check the citations, then run the checker.");
  };

  const move = (i: number, d: number) => setSections((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const set = (i: number, patch: Partial<OutlineSection>) => setSections((s) => s.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border border-[var(--border)] p-2.5">
        <p className="flex items-center gap-1.5 text-xs font-medium"><Wand2 size={13} className="text-[var(--accent)]" /> Autopilot</p>
        <p className="mt-1 text-[0.75rem] text-[var(--muted)]">It uses your papers, your “My research” cards and the links you drew. Every sentence it writes carries a citation you can click.
          {contextDraftIds && contextDraftIds.length > 0 && <> It also reads your other {contextDraftIds.length === 1 ? "draft" : `${contextDraftIds.length} drafts`} to stay consistent. Change this in the drafts list.</>}</p>
        <label className="field-label mt-2 !text-xs" htmlFor="ap-goal">What should it write?</label>
        <textarea id="ap-goal" rows={3} className="field !text-xs" value={instruction} onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. A related-work section on sleep and memory in older adults, focusing on methods" />
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-[var(--muted)]">Papers to use: {scope.length ? `${scope.length} selected` : "all"}</summary>
          <div className="mt-1 max-h-32 space-y-0.5 overflow-auto">
            {papers.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5">
                <input type="checkbox" checked={scope.includes(p.id)} onChange={(e) => setScope((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
                <span className="truncate" title={p.name}>{p.name}</span>
              </label>
            ))}
            {scope.length > 0 && <button className="text-[0.75rem] text-[var(--accent)] underline" onClick={() => setScope([])}>Use all papers</button>}
          </div>
        </details>
        <div className="mt-2 flex items-center gap-1.5">
          <button className="btn btn-secondary !py-1.5 !text-xs" onClick={plan} disabled={planning || writing || papers.length === 0}>
            {planning ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {sections.length ? "Plan again" : "Plan an outline"}
          </button>
          {papers.length === 0 && <span className="text-[0.75rem] text-[var(--muted)]">Add a paper first.</span>}
        </div>
      </div>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}

      {sections.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Outline (edit freely)</p>
          {sections.map((s, i) => (
            <div key={i} className="rounded-lg border border-[var(--border)] p-2">
              <div className="flex items-center gap-1">
                <input className="field !py-1 !text-xs font-medium" value={s.heading} onChange={(e) => set(i, { heading: e.target.value })} aria-label={`Section ${i + 1} title`} />
                <button className="icon-btn" onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}><ArrowUp size={13} /></button>
                <button className="icon-btn" onClick={() => move(i, 1)} aria-label="Move down" disabled={i === sections.length - 1}><ArrowDown size={13} /></button>
                <button className="icon-btn" onClick={() => setSections((x) => x.filter((_, k) => k !== i))} aria-label="Remove section"><Trash2 size={13} /></button>
              </div>
              <input className="field mt-1 !py-1 !text-[0.75rem]" value={s.goal} placeholder="What this section should establish" onChange={(e) => set(i, { goal: e.target.value })} aria-label={`Section ${i + 1} goal`} />
            </div>
          ))}
          <button className="btn btn-quiet !py-1 !text-xs" onClick={() => setSections((s) => [...s, { heading: "", goal: "" }])}><Plus size={12} /> Add a section</button>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[var(--muted)]">Length</span>
            {LENGTHS.map((l) => (
              <button key={l.id} className={`btn btn-quiet !px-2 !py-0.5 !text-[0.75rem] ${words === l.id ? "!bg-[var(--surface-strong)]" : ""}`} onClick={() => setWords(l.id)}>{l.label}</button>
            ))}
          </div>
          {est && <p className="text-[0.75rem] text-[var(--muted)]">Writing {live.length} section{live.length === 1 ? "" : "s"} will use roughly {formatTokens(est.tokens_in + est.tokens_out)} tokens.</p>}
          <div className="flex gap-1.5">
            {writing ? (
              <button className="btn btn-secondary !py-1.5 !text-xs" onClick={() => { cancel.current = true; }}>Stop after this section</button>
            ) : (
              <button className="btn btn-primary !py-1.5 !text-xs" onClick={write} disabled={!live.length || planning}>Write {live.length} section{live.length === 1 ? "" : "s"}</button>
            )}
          </div>
          {writing && <p className="flex items-center gap-1.5 text-[0.75rem] text-[var(--muted)]"><Loader2 size={11} className="animate-spin" /> Writing section {Math.min(progress + 1, live.length)} of {live.length}…</p>}
        </div>
      )}

      {written.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Review before adding</p>
          {written.map((w, i) => (
            <div key={i} className={`rounded-lg border p-2 ${w.error ? "border-[var(--danger)]" : "border-[var(--border)]"}`}>
              <label className="flex items-center gap-1.5 text-xs font-medium">
                {!w.error && <input type="checkbox" checked={w.keep} onChange={(e) => setWritten((x) => x.map((y, k) => (k === i ? { ...y, keep: e.target.checked } : y)))} />}
                {w.heading}
              </label>
              {w.error ? <p className="mt-1 text-[0.75rem] text-[var(--danger)]">{w.error}</p> : (
                <>
                  <p className="mt-1 whitespace-pre-wrap text-[0.75rem] leading-relaxed">{w.text.replace(/\[@[^\]]+\]/g, (m) => (m.startsWith("[@e") ? " [quote]" : " [source]"))}</p>
                  {w.uncited && <p className="mt-1 text-[0.75rem] text-amber-600">No citations were produced for this section. Treat it as unverified.</p>}
                  {/TODO:/.test(w.text) && <p className="mt-1 text-[0.75rem] text-amber-600">The papers did not cover everything here. Look for the TODO line.</p>}
                </>
              )}
            </div>
          ))}
          {!writing && <button className="btn btn-primary !py-1.5 !text-xs" onClick={apply} disabled={!written.some((w) => w.keep && w.text.trim())}>Add selected to my draft</button>}
        </div>
      )}
    </div>
  );
}
