"use client";

import React, { useState } from "react";
import { History, Loader2, Search } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const searchHistory = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      // Backend endpoint is GET with query param
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/search?query=${encodeURIComponent(query.trim())}`,
        {
          method: "GET",
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Search failed");
      }
      const data = await response.json();
      setResults(data.results || []);
      setHasSearched(true);
    } catch (e) {
      console.error("Search error:", e);
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ToolLayout
      title="Past results"
      description="Search everything you have run before, by meaning rather than exact words."
      icon={<History size={20} />}
    >
      <div className="mb-8 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchHistory()}
          placeholder="Search past findings, e.g. “limitations of the sample size”"
          aria-label="Search past results"
          className="field !py-2.5 !text-[15px]"
        />
        <button
          onClick={searchHistory}
          disabled={isLoading || !query.trim()}
          aria-label="Search"
          className="btn btn-primary !px-4"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Search
        </button>
      </div>

      {error && <div role="alert" className="mb-4 rounded-[var(--radius-control)] border border-[var(--danger)] bg-[var(--surface)] p-3 text-sm text-[var(--danger)]">{error}</div>}

      <div className="space-y-4">
        {!hasSearched && !isLoading && (
          <p className="py-12 text-center text-sm text-[var(--muted)]">Search by meaning, not exact words. Results come from everything you have run before.</p>
        )}
        {hasSearched && results.length === 0 && !isLoading && (
          <p className="py-12 text-center text-sm text-[var(--muted)]">Nothing matched. Try describing the idea in different words.</p>
        )}
        {results.map((res, idx) => (
          <article key={`result-${idx}-${res.tool || "unknown"}`} className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
              <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 font-medium capitalize text-[var(--accent-strong)]">{res.tool || "unknown"}</span>
              <span>{res.date}</span>
            </div>
            <div className="whitespace-pre-wrap font-serif text-base leading-relaxed">{res.content}</div>
          </article>
        ))}
      </div>
    </ToolLayout>
  );
}
