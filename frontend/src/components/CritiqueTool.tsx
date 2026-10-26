"use client";

import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ToolLayout, ToolInput, ToolOutput } from "./ToolUI";
import DocumentPicker from "./DocumentPicker";
import ErrorNotice from "./ErrorNotice";
import { getConfig, processDocument } from "../lib/documentApi";

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

export default function CritiqueTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [persona, setPersona] = useState("constructive_colleague");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const handleProcess = async () => {
    const config = getConfig();

    if (!config.apiKey || !config.apiKey.trim()) {
      setError("Add your AI key first");
      return;
    }
    if (!file && !input.trim()) {
      setError("Paste text or upload a document");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (file) {
        setOutput(
          await processDocument("critique", file, { severity: persona }),
        );
        return;
      }
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
            tavily_api_key: config.tavilyApiKey || "",
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "API request failed");
      }
      setOutput(data.output);
    } catch (e) {
      const errorMsg =
        e instanceof Error ? e.message : "Unknown error occurred";
      setError(errorMsg);
      setOutput("");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ToolLayout
      title="Review my writing"
      description="Get a tough but fair review, like a peer reviewer would give, of your idea or draft."
      icon={<AlertTriangle size={20} />}
    >
      <div className="space-y-6">
        <ToolInput
          label="Your idea, claim or draft"
          placeholder="Paste your draft paragraph or research statement..."
          value={input}
          onChange={setInput}
        />
        <DocumentPicker file={file} onChange={setFile} disabled={isLoading} />

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
        {isLoading
          ? file
            ? "Reading document, this can take a few minutes..."
            : "Reviewing..."
          : ""}
        {error && (
          <ErrorNotice error={error} />
        )}
        <button
          onClick={handleProcess}
          disabled={isLoading || (!input.trim() && !file)}
          className="w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Reviewing…" : "Review"}
        </button>
      </div>
      <ToolOutput content={output} isLoading={isLoading} />
    </ToolLayout>
  );
}
