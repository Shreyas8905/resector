"use client";

import React, { useState } from "react";
import { History, Search } from "lucide-react";
import { ToolLayout } from "./ToolUI";

interface HistoryResult {
  tool?: string;
  date?: string;
  content: string;
}

export default function ResearchHistory() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HistoryResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const searchHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/search`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        },
      );
      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      setResults(data.results);
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ToolLayout
      title="Research Archive"
      description="Semantic search across your past research snippets and AI outputs."
      icon={<History size={20} />}
    >
      <div className="flex gap-2 mb-8">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchHistory()}
          placeholder="Search past research findings..."
          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--foreground)] transition-all placeholder:text-[var(--subtle)] focus:border-[var(--accent)] focus:outline-none"
        />
        <button
          onClick={searchHistory}
          disabled={isLoading || !query}
          className="rounded-xl bg-[var(--accent)] px-6 font-semibold text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          {isLoading ? "..." : <Search size={20} />}
        </button>
      </div>

      <div className="space-y-4">
        {results.length === 0 && !isLoading && (
          <p className="py-12 text-center text-[var(--muted)]">
            No matching research snippets found.
          </p>
        )}
        {results.map((res, idx) => (
          <div
            key={idx}
            className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]"
          >
            <div className="flex justify-between items-center mb-2">
              <span className="rounded bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                {res.tool || "unknown"}
              </span>
              <span className="text-[10px] text-[var(--subtle)]">
                {res.date}
              </span>
            </div>
            <div className="whitespace-pre-wrap text-sm text-[var(--foreground)]">
              {res.content}
            </div>
          </div>
        ))}
      </div>
    </ToolLayout>
  );
}
