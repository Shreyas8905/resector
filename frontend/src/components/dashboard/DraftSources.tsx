"use client";

import React, { useMemo, useState } from "react";
import { FileText, Loader2, Quote, Search, Sparkles } from "lucide-react";
import { dashboardApi, type SourceSuggestion } from "@/lib/dashboardApi";
import { docMarker, excerptMarker, resolveKey, keyOfMarker, type DocLike, type ExcerptLike, type SourceInfo } from "@/lib/drafts";

type Props = {
  dashboardId: string;
  docs: DocLike[];
  excerpts: ExcerptLike[];
  /** The sentence being written (selection or sentence around the caret). */
  focusText: () => string;
  onInsert: (marker: string) => void;
  onOpen: (src: SourceInfo) => void;
};

const short = (s: string, n = 150) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);

/** Cite while writing: suggestions for the sentence you are on (search only, no AI tokens) and a browser for
 *  every paper and saved quote on the dashboard. Clicking a result puts a citation marker into the draft. */
export default function DraftSources({ dashboardId, docs, excerpts, focusText, onInsert, onOpen }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [forText, setForText] = useState("");
  const [found, setFound] = useState<SourceSuggestion[] | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState<Record<number, string>>({});

  const suggest = async () => {
    const text = focusText();
    if (text.length < 8) { setError("Put the cursor in a sentence, or select some text, then try again."); return; }
    setBusy(true); setError(""); setForText(text);
    try { setFound((await dashboardApi.suggestSources(dashboardId, text)).sources); }
    catch (e: any) { setError(e.message || "Could not look for sources."); setFound(null); }
    finally { setBusy(false); }
  };

  const open = (marker: string) => {
    const key = keyOfMarker(marker);
    const src = key && resolveKey(key, docs, excerpts);
    if (src) onOpen(src);
  };

  const needle = q.trim().toLowerCase();
  const shownExcerpts = useMemo(() => excerpts.filter((e) => e.quote && (!needle || e.quote.toLowerCase().includes(needle) ||
    (docs.find((d) => d.id === e.document_id)?.filename ?? "").toLowerCase().includes(needle))), [excerpts, docs, needle]);
  const shownDocs = useMemo(() => docs.filter((d) => !needle || d.filename.toLowerCase().includes(needle)), [docs, needle]);

  return (
    <div className="space-y-4 text-sm">
      <section>
        <button className="btn btn-secondary w-full !py-1.5 !text-xs" onClick={suggest} disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Find sources for this sentence
        </button>
        <p className="mt-1 text-[0.75rem] text-[var(--muted)]">Searches your papers and saved quotes. Uses no AI tokens.</p>
        {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}
        {found && (
          <div className="mt-2 space-y-2">
            <p className="truncate text-[0.75rem] text-[var(--muted)]" title={forText}>For: “{short(forText, 90)}”</p>
            {found.length === 0 && <p className="text-xs text-[var(--muted)]">Nothing close in your papers. That may mean the sentence needs a source you have not added yet.</p>}
            {found.map((s, i) => (
              <div key={i} className="rounded-lg border border-[var(--border)] p-2">
                <p className="flex items-center gap-1 text-[0.75rem] font-medium text-[var(--muted)]">
                  {s.kind === "excerpt" ? <Quote size={11} className="text-[var(--accent)]" /> : <FileText size={11} />}
                  <span className="truncate">{s.filename}{s.page ? `, p.${s.page}` : ""}</span>
                  {s.kind === "excerpt" && <span className="ml-auto shrink-0 text-[var(--accent)]">your quote</span>}
                </p>
                <p className="mt-1 text-xs">{short(s.quote, 220)}</p>
                <div className="mt-1.5 flex gap-1.5">
                  <button className="btn btn-primary !px-2 !py-1 !text-[0.75rem]" onClick={() => onInsert(s.marker)}>Cite this</button>
                  <button className="btn btn-quiet !px-2 !py-1 !text-[0.75rem]" onClick={() => open(s.marker)}>Show in paper</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h4 className="mb-1.5 text-xs font-semibold">Browse your sources</h4>
        <div className="relative mb-2">
          <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--subtle)]" />
          <input className="field !py-1.5 !pl-7 !text-xs" placeholder="Filter by word or paper" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter sources" />
        </div>
        {shownExcerpts.length > 0 && <p className="mb-1 text-[0.75rem] font-medium uppercase tracking-wide text-[var(--subtle)]">Saved quotes</p>}
        <div className="space-y-1.5">
          {shownExcerpts.slice(0, 40).map((e) => (
            <div key={e.id} className="rounded-lg border border-[var(--border)] p-2">
              <p className="text-[0.75rem] text-[var(--muted)]">{docs.find((d) => d.id === e.document_id)?.filename ?? "paper"}, p.{e.page}</p>
              <p className="mt-0.5 text-xs">{short(e.quote, 160)}</p>
              <div className="mt-1 flex gap-1.5">
                <button className="btn btn-secondary !px-2 !py-1 !text-[0.75rem]" onClick={() => onInsert(excerptMarker(e.id))}>Cite</button>
                <button className="btn btn-quiet !px-2 !py-1 !text-[0.75rem]" onClick={() => open(excerptMarker(e.id))}>Show</button>
              </div>
            </div>
          ))}
        </div>
        {shownDocs.length > 0 && <p className="mb-1 mt-3 text-[0.75rem] font-medium uppercase tracking-wide text-[var(--subtle)]">Papers (cite a page)</p>}
        <div className="space-y-1.5">
          {shownDocs.map((d) => (
            <div key={d.id} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] p-2">
              <span className="min-w-0 flex-1 truncate text-xs" title={d.filename}>{d.filename}</span>
              <input className="field !w-14 !px-1.5 !py-1 !text-xs" inputMode="numeric" placeholder="page" aria-label={`Page of ${d.filename}`}
                value={page[d.id] ?? ""} onChange={(e) => setPage((p) => ({ ...p, [d.id]: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
              <button className="btn btn-secondary !px-2 !py-1 !text-[0.75rem]" onClick={() => onInsert(docMarker(d.id, Number(page[d.id]) || null))}>Cite</button>
            </div>
          ))}
        </div>
        {shownExcerpts.length === 0 && shownDocs.length === 0 && <p className="text-xs text-[var(--muted)]">No sources match.</p>}
        {docs.length === 0 && <p className="text-xs text-[var(--muted)]">Add papers on the canvas first, then cite them here.</p>}
      </section>
    </div>
  );
}
