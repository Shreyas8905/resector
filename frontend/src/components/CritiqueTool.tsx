"use client";

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ToolLayout, ToolInput, ToolOutput } from './ToolUI';

export default function CritiqueTool() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [severity, setSeverity] = useState('constructive');

  const handleProcess = async () => {
    setIsLoading(true);
    try {
      const config = JSON.parse(localStorage.getItem('resector_config') || '{}');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/process/critique`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: input,
          provider: config.provider || 'groq',
          api_key: config.apiKey,
          model_name: config.modelName,
          severity: severity,
        }),
      });

      if (!response.ok) throw new Error('API request failed');
      const data = await response.json();
      setOutput(data.output);
    } catch (e) {
      setOutput(`Error: ${e instanceof Error ? e.message : 'Unknown error occurred'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ToolLayout
      title="Counter-Argument & Gap Finder"
      description="Stress-test your hypothesis with a brutal peer review."
      icon={<AlertTriangle size={20} />}
    >
      <div className="space-y-6">
        <ToolInput
          label="Hypothesis or Statement"
          placeholder="Paste your draft paragraph or research statement..."
          value={input}
          onChange={setInput}
        />

        <div className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
          <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap">Reviewer Mode</label>
          <input
            type="range"
            min="0"
            max="1"
            step="1"
            value={severity === 'constructive' ? '0' : '1'}
            onChange={(e) => setSeverity(e.target.value === '0' ? 'constructive' : 'brutal')}
            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
          />
          <span className="text-xs font-bold text-zinc-400 w-24 text-right">
            {severity === 'constructive' ? 'Constructive' : 'Brutal'}
          </span>
        </div>

        <button
          onClick={handleProcess}
          disabled={isLoading || !input}
          className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Stress Testing...' : 'Stress Test'}
        </button>
      </div>
      <ToolOutput content={output} isLoading={isLoading} />
    </ToolLayout>
  );
}
