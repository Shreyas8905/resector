"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2 } from "lucide-react";

interface ToolOutputProps {
  content: string;
  isLoading: boolean;
}

export function ToolLayout({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="tool-workspace mx-auto max-w-4xl space-y-8">
      <div className="tool-hero flex items-start gap-4 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] sm:p-8">
        <div className="tool-hero-icon tool-chip mt-1 h-11 w-11 rounded-xl" style={{ "--t": "var(--accent)" } as React.CSSProperties}>{icon}</div>
        <div className="min-w-0">
          <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">ReSector tool</p>
          <h2 className="font-serif text-[1.75rem] font-semibold leading-tight tracking-tight">{title}</h2>
          <p className="mt-1.5 max-w-xl text-[0.9375rem] leading-relaxed text-[var(--muted)]">{description}</p>
        </div>
      </div>
      <div className="tool-stage rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-muted)] p-4 shadow-[var(--shadow)] sm:p-6">
        {children}
      </div>
    </div>
  );
}

export function ToolInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = React.useId();
  return (
    <div className="tool-input-block rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)] sm:p-5">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field h-44 resize-y !p-4 !text-[0.9375rem] leading-relaxed"
      />
    </div>
  );
}

/** Inline progress line shown while a tool is working. */
export function ToolStatus({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-[var(--muted)]">
      <Loader2 size={14} className="animate-spin text-[var(--accent)]" /> {text}
    </p>
  );
}

export function ToolOutput({ content, isLoading }: ToolOutputProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-6" aria-hidden>
        <div className="h-3.5 w-3/4 rounded bg-[var(--surface-strong)]" />
        <div className="h-3.5 w-1/2 rounded bg-[var(--surface-strong)]" />
        <div className="h-3.5 w-5/6 rounded bg-[var(--surface-strong)]" />
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className="tool-output anim-fade rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] px-6 py-6 shadow-[var(--shadow)] sm:px-8">
      <div className="mb-4 border-b border-[var(--border)] pb-3">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Result</p>
        <p className="text-sm text-[var(--muted)]">Generated from the material you provided.</p>
      </div>
      <div className="prose max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
            // eslint-disable-next-line @next/next/no-img-element, @typescript-eslint/no-unused-vars
            img: ({ node, ...props }) => <img {...props} alt={props.alt || ""} />,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
