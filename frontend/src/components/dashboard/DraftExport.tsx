"use client";

import React, { useState } from "react";
import { Copy, Download, FileText, Globe } from "lucide-react";
import { dashboardApi } from "@/lib/dashboardApi";

type Props = { dashboardId: string; draftId: number; title: string; flushSave: () => Promise<void>; notify: (t: string, tone?: "info" | "error") => void };

/** Exports number the citations in order of first use and add a References list with the paper, page and quote. */
export default function DraftExport({ dashboardId, draftId, title, flushSave, notify }: Props) {
  const [quotes, setQuotes] = useState(true);
  const [busy, setBusy] = useState("");

  const fetchExport = async (format: "md" | "html") => {
    await flushSave();
    const res = await fetch(dashboardApi.draftExportUrl(dashboardId, draftId, format, quotes));
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const missing = Number(res.headers.get("X-Missing-Sources") || 0);
    if (missing) notify(`${missing} citation${missing === 1 ? " points" : "s point"} to a paper or quote that was deleted, so ${missing === 1 ? "it was" : "they were"} left out.`, "error");
    return res.text();
  };
  const run = async (kind: "md" | "html" | "copy") => {
    setBusy(kind);
    try {
      if (kind === "copy") { await navigator.clipboard.writeText(await fetchExport("md")); notify("Copied as Markdown, with references."); return; }
      const text = await fetchExport(kind);
      const url = URL.createObjectURL(new Blob([text], { type: kind === "html" ? "text/html" : "text/markdown" }));
      const a = document.createElement("a");
      a.href = url; a.download = `${(title || "draft").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "draft"}.${kind}`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      if (kind === "html") notify("Saved. Open the file and choose Print, then Save as PDF, to make a PDF.");
    } catch (e: any) { notify(e.message || "Could not export.", "error"); } finally { setBusy(""); }
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-[var(--muted)]">Citations become numbered references, in order of first use, with the paper, page and (optionally) the quote.</p>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={quotes} onChange={(e) => setQuotes(e.target.checked)} /> Include the quoted passage in each reference</label>
      <div className="grid gap-1.5">
        <button className="btn btn-secondary !justify-start !py-2 !text-xs" onClick={() => run("md")} disabled={!!busy}><FileText size={13} /> Download Markdown (.md)</button>
        <button className="btn btn-secondary !justify-start !py-2 !text-xs" onClick={() => run("html")} disabled={!!busy}><Globe size={13} /> Download web page (.html, print to PDF)</button>
        <button className="btn btn-secondary !justify-start !py-2 !text-xs" onClick={() => run("copy")} disabled={!!busy}><Copy size={13} /> Copy as Markdown</button>
      </div>
      <p className="flex items-start gap-1.5 text-[0.75rem] text-[var(--muted)]"><Download size={12} className="mt-0.5 shrink-0" /> References show file names, because PDFs do not reliably carry author and year. Add formal citations in your word processor from these pages.</p>
    </div>
  );
}
