"use client";

import React, { useState } from 'react';
import SettingsDrawer from '@/components/SettingsDrawer';
import SifterTool from '@/components/SifterTool';
import CritiqueTool from '@/components/CritiqueTool';
import JargonTool from '@/components/JargonTool';
import ResearchHistory from '@/components/ResearchHistory';

export default function Page() {
  const [activeTool, setActiveTool] = useState<'sifter' | 'critique' | 'jargon' | 'history' | null>(null);

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center border-b border-zinc-800 pb-6">
        <h1 className="text-3xl font-bold tracking-tighter cursor-pointer" onClick={() => setActiveTool(null)}>
          Resector <span className="text-zinc-500 text-lg font-normal">🔬</span>
        </h1>
        <SettingsDrawer />
      </header>

      {!activeTool ? (
        <div className="grid grid-cols-1 gap-4">
          <div
            onClick={() => setActiveTool('sifter')}
            className="p-6 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-all cursor-pointer bg-zinc-900/50"
          >
            <h2 className="text-xl font-semibold mb-2">PDF Abstract & Methodology Sifter</h2>
            <p className="text-zinc-400 text-sm">Extract core research questions, methodology, and fatal flaws.</p>
          </div>
          <div
            onClick={() => setActiveTool('critique')}
            className="p-6 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-all cursor-pointer bg-zinc-900/50"
          >
            <h2 className="text-xl font-semibold mb-2">Counter-Argument & Gap Finder</h2>
            <p className="text-zinc-400 text-sm">Stress-test your hypothesis with a brutal peer review.</p>
          </div>
          <div
            onClick={() => setActiveTool('jargon')}
            className="p-6 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-all cursor-pointer bg-zinc-900/50"
          >
            <h2 className="text-xl font-semibold mb-2">Jargon-to-Plain-English Research Log</h2>
            <p className="text-zinc-400 text-sm">Simplify dense academic text into intuitive analogies.</p>
          </div>
          <div
            onClick={() => setActiveTool('history')}
            className="p-6 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-all cursor-pointer bg-zinc-900/50"
          >
            <h2 className="text-xl font-semibold mb-2">Research Archive</h2>
            <p className="text-zinc-400 text-sm">Semantic search across your past research snippets.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <button
            onClick={() => setActiveTool(null)}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-2"
          >
            ← Back to Dashboard
          </button>
          {activeTool === 'sifter' && <SifterTool />}
          {activeTool === 'critique' && <CritiqueTool />}
          {activeTool === 'jargon' && <JargonTool />}
          {activeTool === 'history' && <ResearchHistory />}
        </div>
      )}
    </div>
  );
}
