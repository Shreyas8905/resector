"use client";

import React, { useState, useEffect } from "react";
import { Settings, X } from "lucide-react";
import { friendlyError } from "../lib/errors";

interface Config {
  provider: string;
  apiKey: string;
  modelName: string;
  tavilyApiKey: string;
  s2ApiKey?: string;
}

interface SavedConfig extends Config {
  name: string;
}

const EMPTY_CONFIG: Config = { provider: "groq", apiKey: "", modelName: "", tavilyApiKey: "", s2ApiKey: "" };

const PROVIDERS: Record<string, { label: string; blurb: string; keyUrl: string; placeholder: string }> = {
  groq: {
    label: "Groq",
    blurb: "Fast, and has a free plan, so it's the easiest way to try ReSector. Free plans have low limits for long documents.",
    keyUrl: "https://console.groq.com/keys",
    placeholder: "gsk_...",
  },
  google: {
    label: "Google Gemini",
    blurb: "Has a free plan with generous limits and handles long documents and figures well.",
    keyUrl: "https://aistudio.google.com/app/apikey",
    placeholder: "AIza...",
  },
  openai: {
    label: "OpenAI",
    blurb: "Paid service (ChatGPT's maker). You'll need billing set up on your OpenAI account.",
    keyUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-...",
  },
  anthropic: {
    label: "Anthropic (Claude)",
    blurb: "Paid service. You'll need billing set up on your Anthropic account.",
    keyUrl: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-...",
  },
};

function loadConfig(): Config {
  if (typeof window === "undefined") return EMPTY_CONFIG;
  try {
    const saved = localStorage.getItem("resector_config");
    if (saved) return { ...EMPTY_CONFIG, ...JSON.parse(saved) };
  } catch {
    // invalid JSON: fall through to defaults
  }
  return EMPTY_CONFIG;
}

const inputClass = "field";

export default function SettingsDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<Config>(loadConfig);
  const [isValidating, setIsValidating] = useState(false);
  const [validation, setValidation] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isTavilyValidating, setIsTavilyValidating] = useState(false);
  const [tavilyValidation, setTavilyValidation] = useState<{ ok: boolean; msg: string } | null>(null);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("resector_saved_configs") || "[]");
    } catch {
      return [];
    }
  });
  const [configName, setConfigName] = useState("");
  const [notice, setNotice] = useState("");

  const provider = PROVIDERS[config.provider] ?? PROVIDERS.groq;

  // Open on first run (no key yet), and whenever something asks for it ("Open Settings" buttons).
  useEffect(() => {
    const open = () => {
      setConfig(loadConfig());
      setIsOpen(true);
    };
    window.addEventListener("resector:open-settings", open);
    try {
      const c = loadConfig();
      if (!c.apiKey.trim() && !sessionStorage.getItem("resector_setup_dismissed")) setIsOpen(true);
    } catch {
      // storage unavailable: just don't auto-open
    }
    return () => window.removeEventListener("resector:open-settings", open);
  }, []);

  const close = () => {
    try {
      sessionStorage.setItem("resector_setup_dismissed", "1");
    } catch {
      // ignore
    }
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) close();
  };

  const validateKey = async () => {
    if (!config.apiKey.trim()) {
      setValidation({ ok: false, msg: "Paste your key first." });
      return;
    }
    setIsValidating(true);
    setValidation(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/validate-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: config.provider,
          api_key: config.apiKey.trim(),
          model_name: config.modelName,
        }),
      });
      const data = await response.json();
      if (response.ok) setValidation({ ok: true, msg: "Key works." });
      else setValidation({ ok: false, msg: friendlyError(data.detail || "Invalid key") });
    } catch (err) {
      setValidation({ ok: false, msg: friendlyError(err) });
    } finally {
      setIsValidating(false);
    }
  };

  const validateTavilyKey = async () => {
    if (!config.tavilyApiKey.trim()) {
      setTavilyValidation({ ok: false, msg: "Paste your key first." });
      return;
    }
    setIsTavilyValidating(true);
    setTavilyValidation(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/validate-tavily`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: config.tavilyApiKey.trim() }),
      });
      const data = await response.json();
      if (response.ok) setTavilyValidation({ ok: true, msg: "Key works." });
      else setTavilyValidation({ ok: false, msg: friendlyError(data.detail || "Invalid key") });
    } catch (err) {
      setTavilyValidation({ ok: false, msg: friendlyError(err) });
    } finally {
      setIsTavilyValidating(false);
    }
  };

  const persist = (c: Config) => {
    localStorage.setItem("resector_config", JSON.stringify(c));
    window.dispatchEvent(new Event("resector:config-changed"));
  };

  const saveActiveConfig = () => {
    persist({ ...config, apiKey: config.apiKey.trim(), tavilyApiKey: config.tavilyApiKey.trim() });
    close();
  };

  const saveCurrentConfig = () => {
    if (!configName.trim()) {
      setNotice("Give the profile a name first.");
      return;
    }
    const next = [...savedConfigs, { name: configName.trim(), ...config }];
    setSavedConfigs(next);
    localStorage.setItem("resector_saved_configs", JSON.stringify(next));
    setConfigName("");
    setNotice("Profile saved.");
  };

  const applyConfig = (saved: SavedConfig) => {
    const c: Config = {
      provider: saved.provider,
      apiKey: saved.apiKey,
      modelName: saved.modelName,
      tavilyApiKey: saved.tavilyApiKey || "",
      s2ApiKey: saved.s2ApiKey || "",
    };
    setConfig(c);
    persist(c);
    setNotice(`Using profile "${saved.name}".`);
  };

  const deleteConfig = (index: number) => {
    const next = savedConfigs.filter((_, i) => i !== index);
    setSavedConfigs(next);
    localStorage.setItem("resector_saved_configs", JSON.stringify(next));
  };

  return (
    <>
      <button
        onClick={() => {
          setConfig(loadConfig());
          setIsOpen(true);
        }}
        className="btn btn-quiet !text-[13px]"
        title="Settings"
      >
        <Settings size={16} />
        <span className="hidden sm:inline">Settings</span>
      </button>

      {isOpen && (
        <div
          className="anim-fade fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-[2px]"
          onClick={handleBackdropClick}
        >
          <div
            role="dialog"
            aria-label="Settings"
            aria-modal="true"
            className="anim-slide-in h-full w-full max-w-md overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-pop)] sm:p-8"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-serif text-2xl font-semibold tracking-tight">Settings</h2>
              <button
                onClick={close}
                aria-label="Close settings"
                className="icon-btn"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mb-6 text-sm text-[var(--muted)]">
              ReSector works with an AI service of your choice. Connect one below. Your key is stored only on this
              computer and sent only to that service.
            </p>

            <div className="space-y-6">
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">1. Choose an AI service</h3>
                <select
                  value={config.provider}
                  onChange={(e) => {
                    setConfig({ ...config, provider: e.target.value });
                    setValidation(null);
                  }}
                  className={inputClass}
                >
                  {Object.entries(PROVIDERS).map(([id, p]) => (
                    <option key={id} value={id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[var(--muted)]">{provider.blurb}</p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">2. Get a key and paste it here</h3>
                <p className="text-xs text-[var(--muted)]">
                  A key is like a password that lets ReSector use your account.{" "}
                  <a
                    href={provider.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[var(--accent)] underline"
                  >
                    Open the {provider.label} key page
                  </a>
                  , create a key, copy it, then paste it below.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => {
                      setConfig({ ...config, apiKey: e.target.value });
                      setValidation(null);
                    }}
                    placeholder={provider.placeholder}
                    aria-label="API key"
                    className={`flex-1 ${inputClass}`}
                  />
                  <button
                    onClick={validateKey}
                    disabled={isValidating || !config.apiKey.trim()}
                    className="btn btn-secondary shrink-0"
                  >
                    {isValidating ? "Testing…" : "Test key"}
                  </button>
                </div>
                {validation && (
                  <p
                    className={`text-xs font-medium ${validation.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
                  >
                    {validation.ok ? "✓ " : ""}
                    {validation.msg}
                  </p>
                )}
              </section>

              <button
                onClick={saveActiveConfig}
                disabled={!config.apiKey.trim()}
                className="btn btn-primary btn-lg w-full"
              >
                Save and start
              </button>

              <details className="rounded-[var(--radius-control)] border border-[var(--border)] p-3.5">
                <summary className="cursor-pointer text-sm font-semibold">Advanced options</summary>
                <div className="mt-4 space-y-5">
                  <div>
                    <label className="field-label">
                      AI model (leave empty for the default)
                    </label>
                    <input
                      type="text"
                      value={config.modelName}
                      onChange={(e) => setConfig({ ...config, modelName: e.target.value })}
                      placeholder="e.g. gpt-4o"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="field-label">
                      Web search key (optional)
                    </label>
                    <p className="mb-2 text-xs text-[var(--subtle)]">
                      Lets the AI look things up online and cite web sources. Free keys at{" "}
                      <a
                        href="https://app.tavily.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        app.tavily.com
                      </a>
                      .
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={config.tavilyApiKey}
                        onChange={(e) => setConfig({ ...config, tavilyApiKey: e.target.value })}
                        placeholder="tvly-..."
                        className={`flex-1 ${inputClass}`}
                      />
                      <button
                        onClick={validateTavilyKey}
                        disabled={isTavilyValidating || !config.tavilyApiKey.trim()}
                        className="btn btn-secondary shrink-0"
                      >
                        {isTavilyValidating ? "Testing…" : "Test"}
                      </button>
                    </div>
                    {tavilyValidation && (
                      <p
                        className={`mt-1 text-xs font-medium ${tavilyValidation.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
                      >
                        {tavilyValidation.ok ? "✓ " : ""}
                        {tavilyValidation.msg}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="field-label">
                      Semantic Scholar key (optional)
                    </label>
                    <input
                      type="password"
                      value={config.s2ApiKey || ""}
                      onChange={(e) => setConfig({ ...config, s2ApiKey: e.target.value })}
                      placeholder="Only needed if the citation graph is rate-limited"
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-3 border-t border-[var(--border)] pt-4">
                    <h4 className="text-sm font-semibold">Saved profiles</h4>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={configName}
                        onChange={(e) => setConfigName(e.target.value)}
                        placeholder="Profile name"
                        className={`flex-1 text-sm ${inputClass}`}
                      />
                      <button
                        onClick={saveCurrentConfig}
                        className="btn btn-secondary shrink-0"
                      >
                        Save
                      </button>
                    </div>
                    {notice && <p className="text-xs text-[var(--muted)]">{notice}</p>}
                    {savedConfigs.length === 0 ? (
                      <p className="text-xs text-[var(--subtle)]">No saved profiles yet.</p>
                    ) : (
                      savedConfigs.map((saved, i) => (
                        <div
                          key={saved.name + i}
                          className="flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] p-3"
                        >
                          <div>
                            <p className="text-sm font-medium">{saved.name}</p>
                            <p className="text-xs capitalize text-[var(--muted)]">{saved.provider}</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => applyConfig(saved)}
                              className="btn btn-quiet !px-2.5 !py-1"
                            >
                              Use
                            </button>
                            <button
                              onClick={() => deleteConfig(i)}
                              aria-label={`Delete profile ${saved.name}`}
                              className="p-2 text-[var(--subtle)] hover:text-[var(--danger)]"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
