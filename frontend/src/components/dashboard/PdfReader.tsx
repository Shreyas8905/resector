"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BoxSelect, Loader2, MousePointer2, Plus, X, ZoomIn, ZoomOut } from "lucide-react";
import "pdfjs-dist/web/pdf_viewer.css";
import type { ExcerptInfo } from "@/lib/dashboardApi";
import { mergeLineRects, toPageFractions, type Rect } from "@/lib/rects";

type PageSize = { w: number; h: number };
type Pdf = any; // pdfjs types are loaded dynamically; keep this loose on purpose

let pdfjsPromise: Promise<any> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerPort = new Worker(
        new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
        { type: "module" },
      );
      return m;
    });
  }
  return pdfjsPromise;
}

export type ReaderFocus = { excerptId: number; nonce: number } | null;

type Props = {
  fileUrl: string;
  filename: string;
  excerpts: ExcerptInfo[];
  focus: ReaderFocus;
  onCreate: (kind: "text" | "area", page: number, rects: Rect[], quote: string) => Promise<void>;
  onClose: () => void;
};

export default function PdfReader({ fileUrl, filename, excerpts, focus, onCreate, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(600);
  const [mode, setMode] = useState<"text" | "area">("text");
  const [currentPage, setCurrentPage] = useState(1);
  const [pending, setPending] = useState<{ page: number; rects: Rect[]; quote: string; x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // Load the document and every page's natural size (so scrolling to a page works before it renders).
  useEffect(() => {
    let cancelled = false;
    let doc: Pdf | null = null;
    setPdf(null); setSizes([]); setError("");
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        doc = await pdfjs.getDocument({ url: fileUrl }).promise;
        if (cancelled) { doc.destroy(); return; }
        const list: PageSize[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const p = await doc.getPage(i);
          const v = p.getViewport({ scale: 1 });
          list.push({ w: v.width, h: v.height });
          if (cancelled) return;
        }
        setPdf(doc); setSizes(list);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not open this PDF.");
      }
    })();
    return () => { cancelled = true; if (doc) doc.destroy(); };
  }, [fileUrl]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(280, el.clientWidth - 32)));
    ro.observe(el);
    setWidth(Math.max(280, el.clientWidth - 32));
    return () => ro.disconnect();
  }, []);

  const scaleFor = useCallback((i: number) => (sizes[i] ? (width / sizes[i].w) * zoom : 1), [sizes, width, zoom]);

  // Jump to a focused excerpt.
  useEffect(() => {
    if (!focus || !sizes.length) return;
    const ex = excerpts.find((e) => e.id === focus.excerptId);
    const root = scrollRef.current;
    if (!ex || !root) return;
    const pageEl = root.querySelector<HTMLElement>(`[data-page="${ex.page}"]`);
    if (!pageEl) return;
    const y0 = Math.min(...ex.rects.map((r) => r[1]));
    root.scrollTo({ top: Math.max(0, pageEl.offsetTop + y0 * pageEl.offsetHeight - 96), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, sizes.length]);

  const onScroll = () => {
    const root = scrollRef.current;
    if (!root) return;
    const probe = root.scrollTop + root.clientHeight / 3;
    let cur = 1;
    root.querySelectorAll<HTMLElement>("[data-page]").forEach((el) => {
      if (el.offsetTop <= probe) cur = Number(el.dataset.page);
    });
    setCurrentPage(cur);
  };

  // Text selection -> floating "Add to canvas".
  const onMouseUp = () => {
    if (mode !== "text") return;
    const sel = window.getSelection();
    const root = scrollRef.current;
    if (!sel || sel.isCollapsed || !sel.rangeCount || !root) { setPending(null); return; }
    const range = sel.getRangeAt(0);
    const node = range.startContainer.nodeType === 1 ? (range.startContainer as Element) : range.startContainer.parentElement;
    const pageEl = node?.closest<HTMLElement>("[data-page]");
    if (!pageEl || !root.contains(pageEl)) { setPending(null); return; }
    const rects = mergeLineRects(toPageFractions(Array.from(range.getClientRects()), pageEl.getBoundingClientRect()));
    if (!rects.length) { setPending(null); return; }
    const last = range.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    setPending({
      page: Number(pageEl.dataset.page), rects, quote: sel.toString(),
      x: Math.min(last.right - box.left, box.width - 150), y: last.bottom - box.top + root.scrollTop + 6,
    });
  };

  const commit = async (kind: "text" | "area", page: number, rects: Rect[], quote: string) => {
    setSaving(true);
    try { await onCreate(kind, page, rects, quote); } finally {
      setSaving(false); setPending(null); window.getSelection()?.removeAllRanges();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0 flex-1 truncate text-sm font-medium" title={filename}>{filename}</div>
        <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
          <button onClick={() => setMode("text")} className={`flex items-center gap-1 rounded-md px-2 py-1 ${mode === "text" ? "bg-[var(--surface-strong)] font-medium" : "text-[var(--muted)]"}`} title="Select text to save it">
            <MousePointer2 size={13} /> Text
          </button>
          <button onClick={() => { setMode("area"); setPending(null); }} className={`flex items-center gap-1 rounded-md px-2 py-1 ${mode === "area" ? "bg-[var(--surface-strong)] font-medium" : "text-[var(--muted)]"}`} title="Drag a box around a figure or table">
            <BoxSelect size={13} /> Area
          </button>
        </div>
        <button onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))} className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label="Zoom out"><ZoomOut size={15} /></button>
        <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label="Zoom in"><ZoomIn size={15} /></button>
        <span className="w-14 text-center text-xs text-[var(--muted)]">{sizes.length ? `${currentPage} / ${sizes.length}` : ""}</span>
        <button onClick={onClose} className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label="Close reader"><X size={16} /></button>
      </div>
      <p className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--muted)]">
        {mode === "text" ? "Select any text, then choose “Add to canvas”." : "Drag a box around a figure or table to save it as a picture."}
      </p>

      <div ref={scrollRef} onScroll={onScroll} onMouseUp={onMouseUp} className="relative min-h-0 flex-1 overflow-auto bg-[var(--surface-muted)] p-4">
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        {!error && !pdf && <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 size={15} className="animate-spin" /> Opening paper…</div>}
        {pdf && sizes.map((sz, i) => (
          <PageView
            key={i} pdf={pdf} pageNo={i + 1} size={sz} scale={scaleFor(i)} mode={mode}
            excerpts={excerpts.filter((e) => e.page === i + 1)} focusId={focus?.excerptId ?? null}
            onArea={(rect) => commit("area", i + 1, [rect], "")}
          />
        ))}
        {pending && mode === "text" && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commit("text", pending.page, pending.rects, pending.quote)}
            disabled={saving}
            style={{ left: Math.max(8, pending.x), top: pending.y }}
            className="absolute z-20 flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-contrast)] shadow-lg"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add to canvas
          </button>
        )}
      </div>
    </div>
  );
}

function PageView({ pdf, pageNo, size, scale, mode, excerpts, focusId, onArea }: {
  pdf: Pdf; pageNo: number; size: PageSize; scale: number; mode: "text" | "area";
  excerpts: ExcerptInfo[]; focusId: number | null; onArea: (r: Rect) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const w = size.w * scale, h = size.h * scale;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let renderTask: any = null;
    let textLayer: any = null;
    (async () => {
      const pdfjs = await loadPdfjs();
      const page = await pdf.getPage(pageNo);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current, text = textRef.current;
      if (!canvas || !text) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderTask = page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      try { await renderTask.promise; } catch { return; } // cancelled by a re-render
      if (cancelled) return;
      text.replaceChildren();
      text.style.setProperty("--scale-factor", String(scale));
      textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport });
      try { await textLayer.render(); } catch { /* cancelled */ }
    })();
    return () => { cancelled = true; try { renderTask?.cancel(); } catch { /* */ } try { textLayer?.cancel(); } catch { /* */ } };
  }, [visible, pdf, pageNo, scale]);

  const frac = (e: React.MouseEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  return (
    <div
      ref={wrapRef} data-page={pageNo}
      className="relative mx-auto mb-4 bg-white shadow-md"
      style={{ width: w, height: h }}
    >
      <canvas ref={canvasRef} className="absolute left-0 top-0" />
      <div ref={textRef} className="textLayer absolute inset-0" style={{ pointerEvents: mode === "text" ? "auto" : "none" }} />
      {excerpts.map((ex) => ex.rects.map((r, k) => (
        <div
          key={`${ex.id}-${k}`}
          className={`pointer-events-none absolute rounded-sm ${ex.id === focusId ? "bg-amber-400/50 ring-2 ring-amber-500" : "bg-amber-300/35"}`}
          style={{ left: `${r[0] * 100}%`, top: `${r[1] * 100}%`, width: `${(r[2] - r[0]) * 100}%`, height: `${(r[3] - r[1]) * 100}%`, mixBlendMode: "multiply" }}
        />
      )))}
      {mode === "area" && (
        <div
          className="absolute inset-0 z-10 cursor-crosshair"
          onMouseDown={(e) => { const [x, y] = frac(e); setDrag({ x0: x, y0: y, x1: x, y1: y }); }}
          onMouseMove={(e) => { if (drag) { const [x, y] = frac(e); setDrag({ ...drag, x1: x, y1: y }); } }}
          onMouseUp={() => {
            if (drag) {
              const r: Rect = [Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.max(drag.x0, drag.x1), Math.max(drag.y0, drag.y1)];
              setDrag(null);
              if (r[2] - r[0] > 0.02 && r[3] - r[1] > 0.02) onArea(r);
            }
          }}
          onMouseLeave={() => setDrag(null)}
        >
          {drag && (
            <div className="absolute border-2 border-[var(--accent)] bg-[var(--accent)]/10"
              style={{ left: `${Math.min(drag.x0, drag.x1) * 100}%`, top: `${Math.min(drag.y0, drag.y1) * 100}%`, width: `${Math.abs(drag.x1 - drag.x0) * 100}%`, height: `${Math.abs(drag.y1 - drag.y0) * 100}%` }} />
          )}
        </div>
      )}
    </div>
  );
}
