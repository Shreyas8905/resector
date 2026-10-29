"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pin, Send, Trash2, X } from "lucide-react";
import { aiConfig, dashboardApi, type ChatMsg, type Cite } from "@/lib/dashboardApi";
import { formatTokens } from "@/lib/citations";
import ErrorNotice from "@/components/ErrorNotice";
import CitedMarkdown from "./CitedMarkdown";

type Props = {
  dashboardId: string;
  papers: { id: number; name: string }[];          // papers that finished reading
  selectedDocIds: number[];                         // paper / excerpt cards selected on the canvas
  selectedExcerptIds: number[];
  onCite: (c: Cite) => void;
  onPin: (question: string, answer: string, cites: Cite[]) => void;
  onUsageChanged: () => void;
  onClose: () => void;
};

export default function AskPanel({ dashboardId, papers, selectedDocIds, selectedExcerptIds, onCite, onPin, onUsageChanged, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [lastTokens, setLastTokens] = useState<number | null>(null);
  const [hint, setHint] = useState<number | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const hasSelection = selectedDocIds.length + selectedExcerptIds.length > 0;
  const effectiveScope = scope === "selected" && hasSelection ? "selected" : "all";
  const scopeDocs = effectiveScope === "selected" ? selectedDocIds : papers.map((p) => p.id);
  const noKey = useMemo(() => !aiConfig().api_key, [messages.length, busy]);  // re-check after each action

  useEffect(() => {
    dashboardApi.chat(dashboardId).then(setMessages).catch(() => {});
  }, [dashboardId]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, busy]);
  useEffect(() => { if (!hasSelection) setScope("all"); }, [hasSelection]);

  useEffect(() => {
    if (!papers.length) { setHint(null); return; }
    let off = false;
    dashboardApi.estimate(dashboardId, "ask", scopeDocs).then((e) => !off && setHint(e.tokens_in + e.tokens_out)).catch(() => {});
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId, papers.length]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput(""); setError(null); setBusy(true);
    setMessages((m) => [...m, { id: -Date.now(), role: "user", content: text, cites: [] }]);
    try {
      const r = await dashboardApi.ask(
        dashboardId, text,
        effectiveScope === "selected" && selectedDocIds.length ? selectedDocIds : undefined,
        effectiveScope === "selected" && selectedExcerptIds.length ? selectedExcerptIds : undefined,
      );
      setMessages((m) => [...m, { id: -Date.now() - 1, role: "assistant", content: r.answer, cites: r.cites }]);
      setLastTokens(r.usage.tokens_in + r.usage.tokens_out);
      onUsageChanged();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const questionFor = (i: number) => {
    for (let k = i - 1; k >= 0; k--) if (messages[k].role === "user") return messages[k].content;
    return "";
  };

  return (
    <aside className="anim-slide-in flex w-[23rem] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span className="text-sm font-semibold">Ask your papers</span>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button className="icon-btn !h-8 !w-8" title="Clear this conversation" aria-label="Clear conversation"
              onClick={async () => { await dashboardApi.clearChat(dashboardId).catch(() => {}); setMessages([]); }}><Trash2 size={14} /></button>
          )}
          <button className="icon-btn !h-8 !w-8" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="rounded-[var(--radius-control)] bg-[var(--surface-muted)] p-3 text-xs leading-relaxed text-[var(--muted)]">
            <p className="font-medium text-[var(--foreground)]">Answers come only from your papers.</p>
            <p className="mt-1">Every claim is marked with a number. Click the number to jump to the exact passage in the paper. If the papers don’t say, you’ll be told.</p>
            <p className="mt-2">Try: “What method does each paper use?” or “Where do these papers disagree?”</p>
          </div>
        )}
        {messages.map((m, i) => m.role === "user" ? (
          <div key={m.id} className="ml-6 rounded-[var(--radius-control)] bg-[var(--accent-soft)] px-3 py-2 text-sm">{m.content}</div>
        ) : (
          <div key={m.id} className="group">
            <CitedMarkdown
              text={m.content}
              onCite={(n) => { const c = m.cites.find((x) => x.n === n); if (c) onCite(c); }}
            />
            {m.cites.length > 0 && (
              <details className="mt-2 text-xs text-[var(--muted)]">
                <summary className="cursor-pointer select-none">Sources ({m.cites.length})</summary>
                <ul className="mt-1.5 space-y-1.5">
                  {m.cites.map((c) => (
                    <li key={c.n}>
                      <button onClick={() => onCite(c)} className="w-full rounded-md bg-[var(--surface-muted)] px-2 py-1.5 text-left hover:text-[var(--foreground)]">
                        <span className="font-semibold text-[var(--accent)]">[{c.n}]</span>{" "}
                        <span className="text-[var(--foreground)]">{(c.filename || "Paper").replace(/\.pdf$/i, "")}{c.page ? `, page ${c.page}` : ""}</span>
                        <span className="mt-0.5 line-clamp-2 block italic">{c.quote}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <button onClick={() => onPin(questionFor(i), m.content, m.cites)}
              className="btn btn-quiet mt-1 !px-2 !py-1 !text-xs"><Pin size={12} /> Pin to canvas</button>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Loader2 size={13} className="animate-spin" /> Reading the papers…</div>}
        {error != null && <ErrorNotice error={error} />}
        <div ref={bottom} />
      </div>

      <form className="space-y-2 border-t border-[var(--border)] p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {noKey && <p className="rounded-md bg-[var(--surface-muted)] p-2 text-xs text-[var(--muted)]">Add your AI provider key in Settings to ask questions.</p>}
        {papers.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">Add a paper and wait for it to finish reading to start asking.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-[var(--muted)]">Asking:</span>
            <button type="button" onClick={() => setScope("all")}
              className={`rounded-full border px-2 py-0.5 ${effectiveScope === "all" ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}>
              All papers ({papers.length})
            </button>
            <button type="button" disabled={!hasSelection} onClick={() => setScope("selected")}
              title={hasSelection ? "" : "Select papers or excerpts on the canvas first"}
              className={`rounded-full border px-2 py-0.5 disabled:opacity-40 ${effectiveScope === "selected" ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}>
              Selected on canvas{hasSelection ? ` (${selectedDocIds.length} paper${selectedDocIds.length === 1 ? "" : "s"}${selectedExcerptIds.length ? `, ${selectedExcerptIds.length} excerpt${selectedExcerptIds.length === 1 ? "" : "s"}` : ""})` : ""}
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={input} onChange={(e) => setInput(e.target.value)} rows={2} placeholder="Ask a question about your papers…"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            className="field resize-none" aria-label="Your question"
          />
          <button className="btn btn-primary !px-3" disabled={!input.trim() || busy || !papers.length} aria-label="Send"><Send size={15} /></button>
        </div>
        <p className="text-[11px] text-[var(--subtle)]">
          {lastTokens != null ? `Last answer used about ${formatTokens(lastTokens)} tokens.` : hint ? `Each question uses up to about ${formatTokens(hint)} tokens.` : ""}
        </p>
      </form>
    </aside>
  );
}
