"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, Download, Loader2, RefreshCw } from "lucide-react";
import { desktopInvoke, isDesktop, type UpdateState } from "@/lib/desktop";

/** Sidebar block for the desktop app: version tag, and the update card with a progress bar.
 *  Renders nothing in a normal browser. */
export default function UpdateStatus({ compact = false }: { compact?: boolean }) {
  const [version, setVersion] = useState<string | null>(null);
  const [u, setU] = useState<UpdateState>({ state: "none" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isDesktop()) return;
    let off = false;
    desktopInvoke<string>("app_version").then((v) => !off && v && setVersion(v));
    desktopInvoke<UpdateState>("update_status").then((s) => !off && s && setU(s));
    const on = (e: Event) => { setU((e as CustomEvent<UpdateState>).detail); setDismissed(false); };
    window.addEventListener("resector-update", on);
    const w = (window as unknown as { __resectorUpdate?: UpdateState }).__resectorUpdate;
    if (w) setU(w);
    return () => { off = true; window.removeEventListener("resector-update", on); };
  }, []);

  if (!version) return null;
  const busy = u.state === "downloading" || u.state === "installing" || u.state === "restarting";
  const showCard = !compact && (busy || u.state === "error" || (u.state === "available" && !dismissed));

  const start = async () => {
    setU({ state: "downloading", version: u.state === "available" ? u.version : "", percent: 0 });
    try {
      const i = (window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string) => Promise<unknown> } }).__TAURI_INTERNALS__;
      await i.invoke("install_update");
    } catch (e) {
      setU({ state: "error", message: String(e) });
    }
  };

  const pct = u.state === "downloading" ? u.percent : u.state === "installing" || u.state === "restarting" ? 100 : 0;
  const label =
    u.state === "downloading" ? `Downloading ${u.version}… ${pct}%`
    : u.state === "installing" ? "Installing…"
    : u.state === "restarting" ? "Restarting ReSector…" : "";

  return (
    <div className={compact ? "flex justify-center py-1" : "space-y-2 px-4 pb-2 pt-3"}>
      {showCard && (
        <div role="status" aria-live="polite" className="rounded-[var(--radius-control)] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-2.5 text-xs">
          {u.state === "available" && (
            <>
              <p className="font-medium text-[var(--foreground)]">Version {u.version} is available</p>
              {u.notes && <p className="mt-0.5 line-clamp-3 text-[var(--muted)]">{u.notes}</p>}
              <div className="mt-2 flex gap-2">
                <button className="btn btn-primary !px-2.5 !py-1 !text-xs" onClick={start}><Download size={12} /> Update now</button>
                <button className="btn btn-quiet !px-2 !py-1 !text-xs" onClick={() => setDismissed(true)}>Later</button>
              </div>
            </>
          )}
          {busy && (
            <>
              <p className="flex items-center gap-1.5 font-medium text-[var(--foreground)]">
                {u.state === "restarting" ? <RefreshCw size={12} className="animate-spin" /> : <Loader2 size={12} className="animate-spin" />} {label}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-strong)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-[var(--muted)]">Please keep ReSector open. It will restart by itself.</p>
            </>
          )}
          {u.state === "error" && (
            <>
              <p className="flex items-start gap-1.5 text-[var(--danger)]"><AlertCircle size={13} className="mt-0.5 shrink-0" /> The update didn’t finish. ReSector keeps working as before.</p>
              <p className="mt-1 break-words text-[10px] text-[var(--muted)]">{u.message}</p>
              <button className="btn btn-secondary mt-2 !px-2.5 !py-1 !text-xs" onClick={start}>Try again</button>
            </>
          )}
        </div>
      )}
      <p className={`text-[11px] text-[var(--subtle)] ${compact ? "text-center" : ""}`} title={`ReSector version ${version}`}>
        {compact ? `v${version}` : `ReSector v${version}`}
        {u.state === "available" && dismissed && !compact && (
          <button className="ml-2 text-[var(--accent)] underline" onClick={() => setDismissed(false)}>Update to {u.version}</button>
        )}
      </p>
    </div>
  );
}
