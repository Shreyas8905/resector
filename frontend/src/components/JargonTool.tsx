"use client";

import React, { useState } from "react";
import { Lightbulb } from "lucide-react";
import { ToolLayout, ToolInput, ToolOutput, ToolStatus } from "./ToolUI";
import DocumentPicker from "./DocumentPicker";
import ErrorNotice from "./ErrorNotice";
import { getConfig, processDocument } from "../lib/documentApi";

export default function JargonTool() {
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
        setOutput(await processDocument("jargon", file));
        return;
      }
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
      title="Explain in plain language"
      description="Paste difficult academic text, or upload a PDF, and get it explained in simple words."
      icon={<Lightbulb size={20} />}
    >
      <ToolInput
        label="Text to simplify"
        placeholder="Paste complex terminology or a formula explanation..."
        value={input}
        onChange={setInput}
      />
      <ToolStatus text={isLoading ? (file ? "Reading document, this can take a few minutes..." : "Simplifying...") : ""} />
      {error && <ErrorNotice error={error} />}
      <DocumentPicker file={file} onChange={setFile} disabled={isLoading} />
      <button
        onClick={handleProcess}
        disabled={isLoading || (!input.trim() && !file)}
        className="btn btn-primary btn-lg w-full"
      >
        {isLoading ? "Working…" : "Explain it"}
      </button>
      <ToolOutput content={output} isLoading={isLoading} />
    </ToolLayout>
  );
}
