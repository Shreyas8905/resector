"use client";

import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ToolLayout, ToolInput, ToolOutput } from "./ToolUI";

const PERSONAS = [
  {
    id: "supportive_peer",
    label: "Supportive Peer",
    desc: "Encouraging & gentle",
  },
  {
    id: "constructive_colleague",
    label: "Constructive Colleague",
    desc: "Balanced & professional",
  },
  {
    id: "rigorous_scholar",
    label: "Rigorous Scholar",
    desc: "Methodology focused",
  },
  {
    id: "brutal_reviewer_2",
    label: "Brutal Reviewer #2",
    desc: "Intellectually ruthless",
  },
  {
    id: "devils_advocate",
    label: "The Devil's Advocate",
    desc: "Challenges hypotheses",
  },
];

function getConfig() {
  try {
    const saved = localStorage.getItem("resector_config");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Invalid JSON
  }
  return { provider: "groq", apiKey: "", modelName: "" };
}

export default function CritiqueTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [persona, setPersona] = useState("constructive_colleague");
  const [error, setError] = useState<string | null>(null);

  const handleProcess = async () => {
    const config = getConfig();

    if (!config.apiKey || !config.apiKey.trim()) {
      setError("Please configure your API key in Settings");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/process/critique`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: input,
            provider: config.provider || "groq",
            api_key: config.apiKey,
            model_name: config.modelName,
            severity: persona,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "API request failed");
      }
      setOutput(data.output);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Unknown error occurred";
      setError(errorMsg);
      setOutput("");
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
          <label className="block text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            Select Reviewer Persona
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPersona(p.id)}
                className={`p-3 text-left rounded-lg border transition-all ${
                  persona === p.id
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--border-strong)]"
                }`}
              >
                <p className="text-sm font-bold">{p.label}</p>
                <p className="text-[10px] opacity-70">{p.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-[var(--danger)] bg-[var(--surface)] p-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        <button
          onClick={handleProcess}
          disabled={isLoading || !input.trim()}
          className="w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Analyzing..." : "Stress Test"}
        </button>
      </div>
      <ToolOutput content={output} isLoading={isLoading} />
    </ToolLayout>
  );
}
