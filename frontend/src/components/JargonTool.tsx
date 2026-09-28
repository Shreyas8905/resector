"use client";

import React, { useState } from "react";
import { Lightbulb } from "lucide-react";
import { ToolLayout, ToolInput, ToolOutput } from "./ToolUI";

export default function JargonTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleProcess = async () => {
    setIsLoading(true);
    try {
      const config = JSON.parse(
        localStorage.getItem("resector_config") || "{}",
      );
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

      if (!response.ok) throw new Error("API request failed");
      const data = await response.json();
      setOutput(data.output);
    } catch (e) {
      setOutput(
        `Error: ${e instanceof Error ? e.message : "Unknown error occurred"}`,
      );
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
      <button
        onClick={handleProcess}
        disabled={isLoading || !input}
        className="w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? "Simplifying..." : "Simplify Text"}
      </button>
      <ToolOutput content={output} isLoading={isLoading} />
    </ToolLayout>
  );
}
