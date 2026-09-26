"use client";

import React, { useState, useEffect } from 'react';
import { History, Search, Trash2 } from 'lucide-react';
import { ToolLayout, ToolOutput } from './ToolUI';

export default function ResearchHistory() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const searchHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setResults(data.results);
    } catch (e) {
      console.error('Search error:', e);
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
          onKeyDown={(e) => e.key === 'Enter' && searchHistory()}
          placeholder="Search past research findings..."
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 transition-all"
        />
        <button
          onClick={searchHistory}
          disabled={isLoading || !query}
          className="px-6 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {isLoading ? '...' : <Search size={20} />}
        </button>
      </div>

      <div className="space-y-4">
        {results.length === 0 && !isLoading && (
          <p className="text-center text-zinc-500 py-12">No matching research snippets found.</p>
        )}
        {results.map((res: any, idx: number) => (
          <div key={idx} className="p-4 border border-zinc-800 rounded-xl bg-zinc-900/50 space-y-2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-2 py-1 bg-zinc-800 rounded">
                {res.tool || 'unknown'}
              </span>
              <span className="text-[10px] text-zinc-600">{res.date}</span>
            </div>
            <div className="text-sm text-zinc-300 whitespace-pre-wrap">
              {res.content}
            </div>
          </div>
        ))}
      </div>
    </ToolLayout>
  );
}
