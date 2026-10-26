// Turns raw provider/network errors into messages a non-technical person can act on.
// The raw text is still available through ErrorNotice's "technical details".

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Unknown error";
}

export function openSettings() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("resector:open-settings"));
}

const has = (s: string, ...needles: string[]) => needles.some((n) => s.includes(n));

export function needsSettings(raw: unknown): boolean {
  const s = errorText(raw).toLowerCase();
  return has(s, "configure your", "api key", "401", "incorrect api", "authentication", "unauthorized", "model not found", "does not exist");
}

export function friendlyError(raw: unknown): string {
  const text = errorText(raw);
  const s = text.toLowerCase();

  if (has(s, "configure your", "add your ai key")) {
    return "Add your AI key first. Open Settings and follow the steps; it takes about a minute.";
  }
  if (has(s, "invalid_api_key", "incorrect api key", "invalid api key", "authentication", "unauthorized", "401", "api key not valid", "permission denied")) {
    return "Your AI service rejected your key. Open Settings, paste the key again and press Test.";
  }
  if (has(s, "413", "request too large", "tokens per minute", "context length", "maximum context", "too many tokens", "document is too long")) {
    return "This is too much text for your AI plan to handle at once. Try a shorter section or document, or choose a plan or provider with a higher limit in Settings.";
  }
  if (has(s, "rate limit", "429", "too many requests", "quota", "resource_exhausted")) {
    return "You've reached your AI service's usage limit for now. Wait a minute and try again. Free plans have low limits, so long documents may need a paid key.";
  }
  if (has(s, "tool_use_failed", "tool call validation", "failed_generation", "need more steps")) {
    return "The AI made a formatting mistake while working. Please try again. If it keeps happening, switch to a different model in Settings > Advanced.";
  }
  if (has(s, "model not found", "model_not_found", "does not exist", "decommissioned", "no longer supported")) {
    return "The selected AI model isn't available. In Settings > Advanced, clear the Model field to use the default.";
  }
  if (has(s, "failed to fetch", "networkerror", "load failed", "econnrefused", "could not connect", "connection error")) {
    return "ReSector couldn't reach its engine or the internet. Check your connection; if you're offline, only already-indexed work is available. If it persists, restart the app.";
  }
  if (has(s, "503", "502", "overloaded", "timeout", "timed out", "temporarily")) {
    return "The AI service is busy right now. Please try again in a moment.";
  }
  if (has(s, "no extractable text", "scanned")) {
    return "This PDF has no readable text; it may be a scan. Try a text-based PDF.";
  }
  if (has(s, "password-protected")) {
    return "This PDF is password-protected. Remove the password and upload it again.";
  }
  const short = text.length > 180 ? text.slice(0, 180) + "…" : text;
  return `Something went wrong: ${short}`;
}
