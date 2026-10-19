"use client";

import React, { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
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
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className="flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 hover:bg-white/10 disabled:opacity-50"
      >
        <Upload size={16} />
        {file ? "Change document" : "Upload a PDF instead"}
      </button>
      {file && (
        <span className="flex items-center gap-2 opacity-80">
          {file.name}
          <button
            type="button"
            aria-label="Remove document"
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
          className="flex items-center gap-1.5 text-xs opacity-80"
          title="A vision model reads each figure (about 1 API call per figure). Figures the answer mentions are shown under it."
        >
          <input
            type="checkbox"
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