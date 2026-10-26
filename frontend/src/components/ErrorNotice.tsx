"use client";

import React from "react";
import { errorText, friendlyError, needsSettings, openSettings } from "../lib/errors";

export default function ErrorNotice({ error }: { error: unknown }) {
  const raw = errorText(error);
  const friendly = friendlyError(error);
  return (
    <div
      role="alert"
      className="rounded-lg border border-[var(--danger)] bg-[var(--surface)] p-3 text-sm text-[var(--danger)]"
    >
      <p>{friendly}</p>
      {needsSettings(error) && (
        <button
          type="button"
          onClick={openSettings}
          className="mt-2 rounded-md border border-[var(--danger)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-muted)]"
        >
          Open Settings
        </button>
      )}
      {raw && raw !== friendly && (
        <details className="mt-2 text-xs opacity-80">
          <summary className="cursor-pointer">Technical details (for bug reports)</summary>
          <p className="mt-1 break-words font-mono">{raw}</p>
        </details>
      )}
    </div>
  );
}
