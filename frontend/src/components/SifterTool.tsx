"use client";

import React, { useState, useEffect } from 'react';
import { FileSearch } from 'lucide-react';
import { ToolLayout, ToolInput, ToolOutput } from './ToolUI';

export default function SifterTool() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleProcess = async () => {
    setIsLoading(true);
    try {
      const config = JSON.parse(localStorage.getItem('resector_config') || '{}');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/process/sifter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: input,
          provider: config.provider || 'groq',
          api_key: config.apiKey,
          model_name: config.modelName,
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
      title="PDF Abstract & Methodology Sifter"
      description="Extract core research questions, methodology, and fatal flaws."
      icon={<FileSearch size={20} />}
    >
      <ToolInput
        label="Academic Text"
        placeholder="Paste an abstract or methodology snippet here..."
        value={input}
        onChange={setInput}
      />
      <button
        onClick={handleProcess}
        disabled={isLoading || !input}
        className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Sifting...' : 'Sift Research'}
      </button>
      <ToolOutput content={output} isLoading={isLoading} />
    </ToolLayout>
  );
}
