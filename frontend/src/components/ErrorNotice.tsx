"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import { errorText, friendlyError, needsSettings, openSettings } from "../lib/errors";

export default function ErrorNotice({ error }: { error: unknown }) {
  const raw = errorText(error);
  const friendly = friendlyError(error);
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-[var(--radius-control)] border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_7%,var(--surface))] p-3.5 text-sm"
    >
      <AlertCircle size={17} className="mt-0.5 shrink-0 text-[var(--danger)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[var(--foreground)]">{friendly}</p>
        {needsSettings(error) && (
          <button type="button" onClick={openSettings} className="btn btn-secondary mt-2.5 !py-1.5 !text-xs">
            Open Settings
          </button>
        )}
        {raw && raw !== friendly && (
          <details className="mt-2 text-xs text-[var(--muted)]">
            <summary className="cursor-pointer">Technical details (for bug reports)</summary>
            <p className="mt-1 break-words font-mono">{raw}</p>
          </details>
        )}
      </div>
    </div>
  );
}
