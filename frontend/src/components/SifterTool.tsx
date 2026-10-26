"use client";

import React, { useState } from "react";
import { FileSearch } from "lucide-react";
import { ToolLayout, ToolInput, ToolOutput } from "./ToolUI";
import DocumentPicker from "./DocumentPicker";
import ErrorNotice from "./ErrorNotice";
import { getConfig, processDocument } from "../lib/documentApi";

export default function SifterTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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
        setOutput(await processDocument("sifter", file));
        return;
      }
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/process/sifter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: input,
            provider: config.provider || "groq",
            api_key: config.apiKey,
            model_name: config.modelName,
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
      title="Summarize a paper"
      description="Paste text or upload a PDF to pull out the research question, the method used, and the weak points."
      icon={<FileSearch size={20} />}
    >
      <ToolInput
        label="Paste text from a paper"
        placeholder="Paste an abstract or methodology snippet here..."
        value={input}
        onChange={setInput}
      />
      {isLoading
        ? file
          ? "Reading your document. This can take a few minutes…"
          : "Working…"
        : ""}
      {error && (
        <ErrorNotice error={error} />
      )}
      <DocumentPicker file={file} onChange={setFile} disabled={isLoading} />

      <button
        onClick={handleProcess}
        disabled={isLoading || (!input.trim() && !file)}
        className="w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? "Working…" : "Summarize"}
      </button>
      <ToolOutput content={output} isLoading={isLoading} />
    </ToolLayout>
  );
}
