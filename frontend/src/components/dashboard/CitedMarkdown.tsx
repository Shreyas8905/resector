"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { linkifyCitations, parseCiteHref } from "@/lib/citations";

const chip =
  "mx-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-md bg-[var(--accent-soft)] px-1 align-baseline text-[11px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)]";

/** Markdown where [3] and [p.7] become clickable chips. Any other link is shown as plain text. */
export default function CitedMarkdown({ text, onCite, onPage, className = "prose prose-compact" }: {
  text: string; onCite?: (n: number) => void; onPage?: (page: number) => void; className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(u) => u}
        components={{
          a: ({ href, children }) => {
            const t = parseCiteHref(href);
            if (!t) return <span>{children}</span>;
            return (
              <button
                type="button" className={`nodrag ${chip}`}
                title={t.kind === "cite" ? "Show this passage in the paper" : `Go to page ${t.page}`}
                onClick={(e) => { e.stopPropagation(); t.kind === "cite" ? onCite?.(t.n) : onPage?.(t.page); }}
              >
                {children}
              </button>
            );
          },
        }}
      >
        {linkifyCitations(text)}
      </ReactMarkdown>
    </div>
  );
}
