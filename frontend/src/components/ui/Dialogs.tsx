"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * In-app replacements for window.prompt / confirm / alert.
 * Native dialogs are unreliable inside desktop webviews (prompt() is not supported by some of them),
 * and they ignore the app's theme. Usage:
 *
 *   const { confirm, ask, notify, dialogs } = useDialogs();
 *   if (!(await confirm({ title: "Delete paper?", danger: true }))) return;
 *   ...
 *   return <>{...}{dialogs}</>;
 */

type ConfirmOpts = {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
};

type AskOpts = {
  title: string;
  message?: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
};

type Active =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "ask"; opts: AskOpts; resolve: (v: string | null) => void };

type Toast = { id: number; text: string; tone: "info" | "error" };

export function useDialogs() {
  const [active, setActive] = useState<Active | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => setActive({ kind: "confirm", opts, resolve })),
    [],
  );

  const ask = useCallback(
    (opts: AskOpts) =>
      new Promise<string | null>((resolve) => setActive({ kind: "ask", opts, resolve })),
    [],
  );

  const notify = useCallback((text: string, tone: "info" | "error" = "info") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3500);
  }, []);

  const dialogs = (
    <>
      {active && (
        <DialogShell
          active={active}
          onClose={() => setActive(null)}
        />
      )}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className={`anim-pop pointer-events-auto flex items-start gap-3 rounded-[var(--radius-control)] border bg-[var(--surface)] px-3.5 py-3 text-sm shadow-[var(--shadow-pop)] ${
                t.tone === "error" ? "border-[var(--danger)] text-[var(--danger)]" : "border-[var(--border)] text-[var(--foreground)]"
              }`}
            >
              <span className="min-w-0 flex-1 break-words">{t.text}</span>
              <button
                onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
                aria-label="Dismiss"
                className="shrink-0 text-[var(--subtle)] hover:text-[var(--foreground)]"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return { confirm, ask, notify, dialogs };
}

function DialogShell({ active, onClose }: { active: Active; onClose: () => void }) {
  const [value, setValue] = useState(active.kind === "ask" ? active.opts.initial ?? "" : "");
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  const finish = (ok: boolean) => {
    if (active.kind === "confirm") active.resolve(ok);
    else active.resolve(ok && value.trim() ? value.trim() : null);
    onClose();
  };

  useEffect(() => {
    if (active.kind === "ask") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      okRef.current?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opts = active.opts;
  const danger = active.kind === "confirm" && active.opts.danger;
  const canSubmit = active.kind === "confirm" || value.trim().length > 0;

  return (
    <div
      className="anim-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && finish(false)}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={opts.title}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) finish(true);
        }}
        className="anim-pop w-full max-w-md rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-pop)]"
      >
        <h2 className="text-base font-semibold">{opts.title}</h2>
        {opts.message && <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{opts.message}</p>}
        {active.kind === "ask" && (
          <div className="mt-4">
            {active.opts.label && <label className="field-label" htmlFor="dlg-input">{active.opts.label}</label>}
            <input
              id="dlg-input"
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={active.opts.placeholder}
              className="field"
              autoComplete="off"
            />
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => finish(false)} className="btn btn-quiet">
            Cancel
          </button>
          <button
            ref={okRef}
            type="submit"
            disabled={!canSubmit}
            className={`btn ${danger ? "bg-[var(--danger)] text-white hover:opacity-90" : "btn-primary"}`}
          >
            {opts.confirmLabel ?? (danger ? "Delete" : "OK")}
          </button>
        </div>
      </form>
    </div>
  );
}
