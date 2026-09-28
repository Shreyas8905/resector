"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
    <div className="mx-auto max-w-4xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 mb-2">
        <div className="rounded-lg bg-[var(--surface-strong)] p-2 text-[var(--accent-strong)]">
          {icon}
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-[var(--muted)]">{description}</p>
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
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-40 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--foreground)] shadow-[var(--shadow)] transition-all placeholder:text-[var(--subtle)] focus:border-[var(--accent)] focus:outline-none"
      />
    </div>
  );
}

export function ToolOutput({ content, isLoading }: ToolOutputProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="h-4 w-3/4 rounded bg-[var(--surface-strong)]" />
        <div className="h-4 w-1/2 rounded bg-[var(--surface-strong)]" />
        <div className="h-4 w-5/6 rounded bg-[var(--surface-strong)]" />
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className="prose max-w-none rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
