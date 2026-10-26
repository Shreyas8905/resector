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
    <div className="mb-8 flex w-full flex-col items-center gap-3 rounded-xl border border-[var(--accent)] bg-[var(--surface)] p-5 text-left shadow-[var(--shadow)] sm:flex-row">
      <KeyRound size={22} className="shrink-0 text-[var(--accent)]" />
      <div className="flex-1">
        <p className="text-sm font-semibold">One quick step before you start</p>
        <p className="text-sm text-[var(--muted)]">
          ReSector uses an AI service you choose. Connect one (it takes about a minute, and free options exist). Your key stays on this computer.
        </p>
      </div>
      <button
        onClick={openSettings}
        className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] hover:bg-[var(--accent-strong)]"
      >
        Set up now
      </button>
    </div>
  );
}
