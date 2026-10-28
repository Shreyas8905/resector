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
    <div className="mx-auto max-w-3xl space-y-7">
      <div className="flex items-start gap-4 border-b border-[var(--border)] pb-6">
        <div className="mt-1 text-[var(--accent)]">{icon}</div>
        <div>
          <h2 className="font-serif text-[1.75rem] font-semibold leading-tight tracking-tight">{title}</h2>
          <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-[var(--muted)]">{description}</p>
        </div>
      </div>
      {children}
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
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field h-44 resize-y !p-4 !text-[15px] leading-relaxed"
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
    <div className="anim-fade rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] px-6 py-6 sm:px-8">
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
