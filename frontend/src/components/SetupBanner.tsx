"use client";

import React, { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { openSettings } from "../lib/errors";

function hasKey(): boolean {
  try {
    const c = JSON.parse(localStorage.getItem("resector_config") || "{}");
    return Boolean(c.apiKey && String(c.apiKey).trim());
  } catch {
    return false;
  }
}

/** Shown on the home screen until an AI key is saved. */
export default function SetupBanner() {
  const [ready, setReady] = useState(true);
  useEffect(() => {
    const update = () => setReady(hasKey());
    update();
    window.addEventListener("resector:config-changed", update);
    return () => window.removeEventListener("resector:config-changed", update);
  }, []);
  if (ready) return null;
  return (
    <div className="setup-banner flex w-full flex-col gap-4 rounded-[var(--radius-panel)] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-5 text-left shadow-[var(--shadow)] sm:flex-row sm:items-center">
      <span className="tool-chip h-10 w-10 rounded-xl" style={{ "--t": "var(--accent)" } as React.CSSProperties}><KeyRound size={20} /></span>
      <div className="flex-1">
        <p className="text-sm font-semibold">Connect an AI service to get started</p>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          ReSector uses an AI service you choose. It takes about a minute, and free options exist. Your key stays on this computer.
        </p>
      </div>
      <button onClick={openSettings} className="btn btn-primary shrink-0">
        Set up now
      </button>
    </div>
  );
}
