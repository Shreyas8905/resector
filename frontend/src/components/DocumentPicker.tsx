"use client";

import React, { useEffect, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { getAnalyzeFigures, setAnalyzeFigures } from "../lib/figureSettings";

export default function DocumentPicker({
  file,
  onChange,
  disabled,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [analyze, setAnalyze] = useState(false);
  useEffect(() => setAnalyze(getAnalyzeFigures()), []);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <input
        ref={ref}
        type="file"
        accept=".pdf,.txt,.md"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className="btn btn-secondary">
        <Upload size={15} />
        {file ? "Change document" : "Upload a PDF instead"}
      </button>
      {file && (
        <span className="flex max-w-full items-center gap-2 rounded-[var(--radius-control)] bg-[var(--surface-muted)] py-1.5 pl-2.5 pr-1.5 text-[13px]">
          <FileText size={14} className="shrink-0 text-[var(--accent)]" />
          <span className="truncate">{file.name}</span>
          <button
            type="button"
            aria-label="Remove document"
            className="rounded p-0.5 text-[var(--muted)] hover:text-[var(--foreground)]"
            onClick={() => {
              onChange(null);
              if (ref.current) ref.current.value = "";
            }}
          >
            <X size={14} />
          </button>
        </span>
      )}
      {file && file.name.toLowerCase().endsWith(".pdf") && (
        <label
          className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--muted)]"
          title="A vision model reads each figure (about 1 API call per figure). Figures the answer mentions are shown under it."
        >
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={analyze}
            onChange={(e) => {
              setAnalyze(e.target.checked);
              setAnalyzeFigures(e.target.checked);
            }}
          />
          Analyze figures
        </label>
      )}
    </div>
  );
}
