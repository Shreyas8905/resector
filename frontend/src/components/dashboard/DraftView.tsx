"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, FilePlus2, History, Loader2, PanelRightClose, PanelRightOpen, PenLine, ShieldCheck, Trash2, Wand2, Quote, Download } from "lucide-react";
import { dashboardApi, type DraftSummary } from "@/lib/dashboardApi";
import {
  addCitationAfter, appendBlock, insertAt, numberMarkers, textForSuggestion, wordCount, type SourceInfo,
} from "@/lib/drafts";
import { useDialogs } from "@/components/ui/Dialogs";
import { ResizeHandle, panelStyle, usePanelWidth } from "@/components/ui/Resizable";
import CitedMarkdown from "./CitedMarkdown";
import DraftAutopilot from "./DraftAutopilot";
import DraftCheck from "./DraftCheck";
import DraftExport from "./DraftExport";
import DraftSources from "./DraftSources";
import DraftVersions from "./DraftVersions";

type Tab = "sources" | "check" | "autopilot" | "versions" | "export";
type Props = {
  dashboardId: string; dashboardTitle: string;
  docs: { id: number; filename: string }[];
  excerpts: { id: number; document_id: number; page: number; quote: string; rects: number[][] }[];
  papers: { id: number; name: string }[];
  onOpenSource: (src: SourceInfo) => void;
  onUsageChanged: () => void;
  /** Text sent from the Ask panel ("Add to draft"). Handled once per nonce. */
  insertRequest: { text: string; nonce: number } | null;
};

const TABS: { id: Tab; label: string; Icon: any }[] = [
  { id: "sources", label: "Cite", Icon: Quote },
  { id: "check", label: "Check", Icon: ShieldCheck },
  { id: "autopilot", label: "Autopilot", Icon: Wand2 },
  { id: "versions", label: "Versions", Icon: History },
  { id: "export", label: "Export", Icon: Download },
];

export default function DraftView({ dashboardId, dashboardTitle, docs, excerpts, papers, onOpenSource, onUsageChanged, insertRequest }: Props) {
  const { confirm, ask, notify, dialogs } = useDialogs();
  const side = usePanelWidth("draft_side", 330, 270, 520);
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [id, setId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [tab, setTab] = useState<Tab>("sources");
  const [sideOpen, setSideOpen] = useState(true);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [saveTick, setSaveTick] = useState(0);
  const [versionsKey, setVersionsKey] = useState(0);
  const [loadError, setLoadError] = useState("");

  const ta = useRef<HTMLTextAreaElement>(null);
  const sel = useRef({ start: 0, end: 0 });
  const contentRef = useRef("");
  const idRef = useRef<number | null>(null);
  const dirty = useRef(false);
  const timer = useRef<number | null>(null);
  const lastNonce = useRef(0);
  contentRef.current = content;
  idRef.current = id;

  useEffect(() => { try { setSideOpen(localStorage.getItem("resector_draft_side") !== "0"); } catch { /* default open */ } }, []);
  const toggleSide = () => setSideOpen((v) => { try { localStorage.setItem("resector_draft_side", v ? "0" : "1"); } catch { /* not remembered */ } return !v; });

  // ---------------------------------------------------------------- saving
  const flushSave = useCallback(async () => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    if (!dirty.current || idRef.current == null) return;
    const text = contentRef.current, did = idRef.current;
    dirty.current = false;
    setSaveState("saving");
    try { await dashboardApi.saveDraft(dashboardId, did, { content: text }); setSaveState("saved"); setSaveTick((t) => t + 1); }
    catch { dirty.current = true; setSaveState("error"); }
  }, [dashboardId]);

  const change = (text: string) => {
    setContent(text); contentRef.current = text; dirty.current = true; setSaveState("saving");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flushSave, 1200);
  };

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); flushSave(); /* save pending edits on leaving */ }, [flushSave]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && ta.current && document.activeElement === ta.current) { e.preventDefault(); flushSave(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flushSave]);

  // ---------------------------------------------------------------- load
  const open = useCallback(async (draftId: number) => {
    await flushSave();
    try {
      const d = await dashboardApi.getDraft(dashboardId, draftId);
      setId(d.id); setTitle(d.title); setContent(d.content); contentRef.current = d.content; dirty.current = false; setSaveState("saved");
      sel.current = { start: d.content.length, end: d.content.length };
    } catch (e: any) { notify(e.message || "Could not open the draft.", "error"); }
  }, [dashboardId, flushSave, notify]);

  const reloadList = useCallback(async () => {
    try { const l = await dashboardApi.drafts(dashboardId); setDrafts(l); return l; }
    catch (e: any) { setLoadError(e.message || "Could not load drafts."); setDrafts([]); return []; }
  }, [dashboardId]);

  useEffect(() => { (async () => { const l = await reloadList(); if (l.length) open(l[0].id); })(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dashboardId]);

  const create = useCallback(async (initial = "") => {
    await flushSave();
    try {
      const d = await dashboardApi.createDraft(dashboardId, `${dashboardTitle || "My"} draft`.slice(0, 100), initial);
      setId(d.id); setTitle(d.title); setContent(d.content); contentRef.current = d.content; dirty.current = false; setSaveState("saved");
      sel.current = { start: d.content.length, end: d.content.length };
      await reloadList();
      return d.id;
    } catch (e: any) { notify(e.message || "Could not create a draft.", "error"); return null; }
  }, [dashboardId, dashboardTitle, flushSave, notify, reloadList]);

  const rename = async () => {
    if (id == null || !title.trim()) return;
    try { await dashboardApi.saveDraft(dashboardId, id, { title: title.trim() }); reloadList(); } catch { notify("Could not rename the draft.", "error"); }
  };
  const remove = async () => {
    if (id == null) return;
    if (!(await confirm({ title: "Delete this draft?", message: "The draft and its saved versions are deleted. This cannot be undone.", confirmLabel: "Delete", danger: true }))) return;
    try {
      await dashboardApi.deleteDraft(dashboardId, id);
      dirty.current = false; setId(null); setContent(""); setTitle("");
      const l = await reloadList(); if (l.length) open(l[0].id);
    } catch (e: any) { notify(e.message || "Could not delete.", "error"); }
  };

  // ---------------------------------------------------------------- editing helpers
  const remember = () => { const t = ta.current; if (t) sel.current = { start: t.selectionStart, end: t.selectionEnd }; };
  const insertText = useCallback((text: string) => {
    const at = Math.min(sel.current.end, contentRef.current.length);
    const r = insertAt(contentRef.current, at, text);
    change(r.content);
    sel.current = { start: r.caret, end: r.caret };
    setMode("write");
    window.setTimeout(() => { const t = ta.current; if (t) { t.focus(); t.setSelectionRange(r.caret, r.caret); } }, 0);
  /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const addCitation = (raw: string, marker: string) => {
    const next = addCitationAfter(contentRef.current, raw, marker);
    if (next == null) return false;
    change(next);
    return true;
  };
  const jumpTo = (raw: string) => {
    const i = contentRef.current.indexOf(raw);
    if (i < 0) return;
    setMode("write");
    window.setTimeout(() => {
      const t = ta.current; if (!t) return;
      t.focus(); t.setSelectionRange(i, i + raw.length);
      const line = contentRef.current.slice(0, i).split("\n").length - 1;
      const lh = parseFloat(getComputedStyle(t).lineHeight) || 26;
      t.scrollTop = Math.max(0, line * lh - t.clientHeight / 3);
    }, 0);
  };
  const applyAutopilot = async (blocks: string) => {
    if (id == null) return;
    const next = appendBlock(contentRef.current, blocks);
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    await dashboardApi.saveDraft(dashboardId, id, { content: next, snapshot: "Before autopilot" });
    setContent(next); contentRef.current = next; dirty.current = false; setSaveState("saved");
    setSaveTick((t) => t + 1); setVersionsKey((k) => k + 1); reloadList();
  };

  // text sent from the Ask panel
  useEffect(() => {
    if (!insertRequest || insertRequest.nonce === lastNonce.current) return;
    lastNonce.current = insertRequest.nonce;
    (async () => {
      if (idRef.current == null) { await create(insertRequest.text + "\n"); notify("Started a new draft with that answer."); return; }
      sel.current = { start: contentRef.current.length, end: contentRef.current.length };
      insertText((contentRef.current.trim() ? "\n\n" : "") + insertRequest.text + "\n");
      notify("Added to the end of your draft.");
    })();
  /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [insertRequest]);

  // ---------------------------------------------------------------- preview
  const numbered = useMemo(() => (mode === "preview" ? numberMarkers(content, docs, excerpts) : null), [mode, content, docs, excerpts]);
  const words = useMemo(() => wordCount(content), [content]);

  if (drafts === null) return <div className="flex items-center gap-2 p-8 text-sm text-[var(--muted)]"><Loader2 size={15} className="animate-spin" /> Opening drafts…</div>;

  const bar = "flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-1.5";
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className={bar}>
          <select className="field !w-auto max-w-[11rem] !py-1 !text-xs" value={id ?? ""} onChange={(e) => e.target.value && open(Number(e.target.value))} aria-label="Choose a draft">
            {id == null && <option value="">No draft yet</option>}
            {drafts.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
          <button className="btn btn-secondary !px-2 !py-1 !text-xs" onClick={() => create("")}><FilePlus2 size={13} /> New</button>
          {id != null && (
            <>
              <input className="field !w-auto min-w-[8rem] max-w-xs flex-1 !py-1 !font-serif !text-sm !font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={rename} aria-label="Draft title" />
              <div className="ml-auto flex items-center gap-1">
                <span className="mr-1 text-[11px] text-[var(--muted)]">
                  {saveState === "saving" ? "Saving…" : saveState === "error" ? <span className="text-[var(--danger)]">Not saved, will retry</span> : "Saved"} · {words} words
                </span>
                <div className="flex rounded-lg border border-[var(--border)] p-0.5" role="group" aria-label="Mode">
                  <button className={`btn btn-quiet !px-2 !py-0.5 !text-xs ${mode === "write" ? "!bg-[var(--surface-strong)]" : ""}`} onClick={() => setMode("write")}><PenLine size={12} /> Write</button>
                  <button className={`btn btn-quiet !px-2 !py-0.5 !text-xs ${mode === "preview" ? "!bg-[var(--surface-strong)]" : ""}`} onClick={() => { remember(); setMode("preview"); }}><BookOpen size={12} /> Preview</button>
                </div>
                <button className="icon-btn" onClick={remove} aria-label="Delete this draft" title="Delete this draft"><Trash2 size={14} /></button>
                <button className="icon-btn" onClick={toggleSide} aria-label={sideOpen ? "Hide the writing tools" : "Show the writing tools"} title={sideOpen ? "Hide the writing tools" : "Show the writing tools"}>
                  {sideOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
                </button>
              </div>
            </>
          )}
        </div>

        {id == null ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-md text-center">
              <PenLine size={28} className="mx-auto mb-2 text-[var(--accent)]" />
              <p className="text-sm font-medium">Write with your papers beside you</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Cite a quote or page as you type, have each sentence checked against its source, or let autopilot draft sections from your canvas for you to review.</p>
              {loadError && <p className="mt-2 text-xs text-[var(--danger)]">{loadError}</p>}
              <button className="btn btn-primary mt-3" onClick={() => create("")}>Start a draft</button>
            </div>
          </div>
        ) : mode === "write" ? (
          <textarea
            ref={ta} value={content} spellCheck
            onChange={(e) => { change(e.target.value); remember(); }}
            onSelect={remember} onKeyUp={remember} onClick={remember} onBlur={remember}
            placeholder={"Start writing. Use the Cite tab to add a quote or page as you go, or Autopilot to draft sections.\n\nMarkdown works: # Heading, - list, **bold**."}
            className="min-h-0 flex-1 resize-none bg-[var(--background)] px-6 py-5 font-serif text-[15px] leading-7 outline-none"
            aria-label="Draft text"
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="mx-auto max-w-3xl">
              {content.trim() ? (
                <CitedMarkdown text={numbered?.text ?? ""} className="prose"
                  onCite={(n) => { const s = numbered?.sources[n - 1]; if (s) onOpenSource(s); }} />
              ) : <p className="text-sm text-[var(--muted)]">Nothing to preview yet.</p>}
              {numbered && numbered.sources.length > 0 && (
                <div className="mt-6 border-t border-[var(--border)] pt-3">
                  <h3 className="text-sm font-semibold">References</h3>
                  <ol className="mt-1.5 space-y-1 text-xs text-[var(--muted)]">
                    {numbered.sources.map((s) => (
                      <li key={s.key}>
                        <button className="text-left hover:text-[var(--foreground)]" onClick={() => onOpenSource(s)}>
                          <span className="font-semibold text-[var(--accent)]">[{s.n}]</span> {s.filename}{s.page ? `, p.${s.page}` : ""}{s.quote ? ` — “${s.quote.length > 140 ? s.quote.slice(0, 140) + "…" : s.quote}”` : ""}
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {numbered && numbered.missing.length > 0 && (
                <p className="mt-3 text-xs text-amber-600">{numbered.missing.length} citation{numbered.missing.length === 1 ? " points" : "s point"} to a paper or quote that no longer exists and {numbered.missing.length === 1 ? "is" : "are"} hidden here.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {sideOpen && id != null && (
        <aside style={panelStyle(side.width)} className="relative flex w-80 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)] md:w-[var(--panel-w)]">
          <ResizeHandle panel={side} edge="left" label="Resize the writing tools" />
          <div className="flex border-b border-[var(--border)] px-1" role="tablist">
            {TABS.map(({ id: t, label, Icon }) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} title={label}
                className={`flex flex-1 items-center justify-center gap-1 border-b-2 px-1 py-2 text-[11px] font-medium ${tab === t ? "border-[var(--accent)] text-[var(--foreground)]" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`}>
                <Icon size={13} /><span className="hidden 2xl:inline">{label}</span>
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <h3 className="mb-2 text-sm font-semibold">{TABS.find((t) => t.id === tab)?.label === "Cite" ? "Cite while writing" : TABS.find((t) => t.id === tab)?.label}</h3>
            {tab === "sources" && (
              <DraftSources dashboardId={dashboardId} docs={docs} excerpts={excerpts}
                focusText={() => textForSuggestion(contentRef.current, sel.current.start, sel.current.end)}
                onInsert={insertText} onOpen={onOpenSource} />
            )}
            {tab === "check" && (
              <DraftCheck dashboardId={dashboardId} draftId={id} content={content} saveTick={saveTick} docs={docs} excerpts={excerpts}
                flushSave={flushSave} onAddCitation={addCitation} onJump={jumpTo} onOpen={onOpenSource} onUsageChanged={onUsageChanged} notify={notify} />
            )}
            {tab === "autopilot" && (
              <DraftAutopilot dashboardId={dashboardId} papers={papers} content={content} onApply={applyAutopilot}
                onUsageChanged={onUsageChanged} confirm={confirm} notify={notify} />
            )}
            {tab === "versions" && (
              <DraftVersions dashboardId={dashboardId} draftId={id} content={content} refreshKey={versionsKey + saveTick}
                flushSave={flushSave} confirm={confirm} ask={ask}
                onRestored={(c) => { setContent(c); contentRef.current = c; dirty.current = false; setSaveState("saved"); reloadList(); }} />
            )}
            {tab === "export" && <DraftExport dashboardId={dashboardId} draftId={id} title={title} flushSave={flushSave} notify={notify} />}
          </div>
        </aside>
      )}
      {dialogs}
    </div>
  );
}
