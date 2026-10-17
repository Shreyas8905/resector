export function getConfig() {
  try {
    const saved = localStorage.getItem("resector_config");
    if (saved) return JSON.parse(saved);
  } catch {
    // Ignore JSON parse errors
  }
  return { provider: "groq", apiKey: "", modelName: "", tavilyApiKey: "" };
}

export async function processDocument(
  tool: "sifter" | "critique" | "jargon",
  file: File,
  extra: Record<string, string> = {},
): Promise<string> {
  const config = getConfig();
  if (!config.apiKey || !config.apiKey.trim()) {
    throw new Error("Please configure your API key in Settings");
  }

  const form = new FormData();
  form.append("file", file);
  form.append("provider", config.provider || "groq");
  form.append("api_key", config.apiKey);
  if (config.modelName) form.append("model_name", config.modelName);
  if (config.tavilyApiKey) form.append("tavily_api_key", config.tavilyApiKey);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);

  // No Content-Type header: the browser sets the multipart boundary itself
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/process/${tool}/upload`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Upload failed");
  return data.output;
}