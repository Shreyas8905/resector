"use client";

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ToolLayout, ToolInput, ToolOutput } from './ToolUI';

const PERSONAS = [
  { id: 'supportive_peer', label: 'Supportive Peer', desc: 'Encouraging & gentle' },
  { id: 'constructive_colleague', label: 'Constructive Colleague', desc: 'Balanced & professional' },
  { id: 'rigorous_scholar', label: 'Rigorous Scholar', desc: 'Methodology focused' },
  { id: 'brutal_reviewer_2', label: 'Brutal Reviewer #2', desc: 'Intellectually ruthless' },
  { id: 'devils_advocate', label: 'The Devil\'s Advocate', desc: 'Challenges hypotheses' },
];

export default function CritiqueTool() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [persona, setPersona] = useState('constructive_colleague');

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
          severity: persona,
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
      description="Stress-test your hypothesis with a professional peer review."
      icon={<AlertTriangle size={20} />}
    >
      <div className="space-y-6">
        <ToolInput
          label="Hypothesis or Statement"
          placeholder="Paste your draft paragraph or research statement..."
          value={input}
          onChange={setInput}
        />

        <div className="space-y-3">
          <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider">Select Reviewer Persona</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPersona(p.id)}
                className={`p-3 text-left rounded-lg border transition-all ${
                  persona === p.id
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600'
                }`}
              >
                <p className="text-sm font-bold">{p.label}</p>
                <p className="text-[10px] opacity-70">{p.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleProcess}
          disabled={isLoading || !input}
          className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Analyzing...' : 'Stress Test'}
        </button>
      </div>
      <ToolOutput content={output} isLoading={isLoading} />
    </ToolLayout>
  );
}
