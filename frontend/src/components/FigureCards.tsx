"use client";

import { useState } from "react";

export interface FigureInfo {
  id: number;
  label: string;
  page: number;
  caption: string;
  kind?: string;
  description?: string;
  filename?: string | null;
  url: string; // relative, e.g. /chat/figures/12
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function FigureCards({ figures }: { figures?: FigureInfo[] }) {
  const [open, setOpen] = useState<FigureInfo | null>(null);
  if (!figures || figures.length === 0) return null;
  return (
    <>
      <div className="not-prose mt-4 grid gap-3">
        {figures.map((f) => (
          <figure key={f.id} className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${API}${f.url}`}
              alt={`${f.label}: ${f.caption}`}
              className="max-h-96 w-full cursor-zoom-in bg-white object-contain"
              onClick={() => setOpen(f)}
              loading="lazy"
            />
            <figcaption className="border-t border-[var(--border)] px-3 py-2 font-sans text-xs leading-snug text-[var(--foreground)]">
              <span className="font-semibold">{f.label}</span>
              {f.filename ? ` · ${f.filename}` : ""} · p.{f.page}
              {f.caption ? <span className="block text-[var(--muted)]">{f.caption}</span> : null}
            </figcaption>
          </figure>
        ))}
      </div>
      {open && (
        <div
          className="anim-fade fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-label={`${open.label}, enlarged`}
          onClick={() => setOpen(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${API}${open.url}`} alt={open.label} className="max-h-full max-w-full rounded bg-white" />
        </div>
      )}
    </>
  );
}
