"use client";

import React, { useState } from "react";
import { Lightbulb } from "lucide-react";
import { ToolLayout, ToolInput, ToolOutput } from "./ToolUI";

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

export default function JargonTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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
        `${process.env.NEXT_PUBLIC_API_URL}/process/jargon`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: input,
            provider: config.provider || "groq",
            api_key: config.apiKey,
            model_name: config.modelName,
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
      title="Jargon-to-Plain-English Research Log"
      description="Simplify dense academic text into intuitive analogies."
      icon={<Lightbulb size={20} />}
    >
      <ToolInput
        label="Academic Jargon"
        placeholder="Paste complex terminology or a formula explanation..."
        value={input}
        onChange={setInput}
      />
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
        {isLoading ? "Simplifying..." : "Simplify Text"}
      </button>
      <ToolOutput content={output} isLoading={isLoading} />
    </ToolLayout>
  );
}
