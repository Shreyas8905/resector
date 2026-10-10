"use client";

import React, { useState, useEffect } from "react";

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

export default function SettingsDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<Config>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("resector_config");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // Invalid JSON - return defaults
          return {
            provider: "groq",
            apiKey: "",
            modelName: "",
            tavilyApiKey: "",
            s2ApiKey: "",
          };
        }
      }
    }
    return {
      provider: "groq",
      apiKey: "",
      modelName: "",
      tavilyApiKey: "",
      s2ApiKey: "",
    };
  });

  const [isValidating, setIsValidating] = useState(false);
  const [validationMsg, setValidationMsg] = useState("");
  const [isTavilyValidating, setIsTavilyValidating] = useState(false);
  const [tavilyValidationMsg, setTavilyValidationMsg] = useState("");
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("resector_saved_configs");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return [];
        }
      }
    }
    return [];
  });
  const [configName, setConfigName] = useState("");

  // Close drawer on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
    }
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setIsOpen(false);
    }
  };

  const validateKey = async () => {
    if (!config.apiKey || !config.apiKey.trim()) {
      setValidationMsg("❌ API key cannot be empty");
      return;
    }
    setIsValidating(true);
    setValidationMsg("");
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/validate-key`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: config.provider,
            api_key: config.apiKey.trim(),
            model_name: config.modelName,
          }),
        },
      );

      const data = await response.json();
      if (response.ok) {
        setValidationMsg("API key is valid");
      } else {
        setValidationMsg(data.detail || "Invalid key");
      }
    } catch (err) {
      setValidationMsg("Connection error");
    } finally {
      setIsValidating(false);
    }
  };

  const validateTavilyKey = async () => {
    if (!config.tavilyApiKey || !config.tavilyApiKey.trim()) {
      setTavilyValidationMsg("Tavily key cannot be empty");
      return;
    }
    setIsTavilyValidating(true);
    setTavilyValidationMsg("");
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/validate-tavily`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: config.tavilyApiKey.trim(),
          }),
        },
      );

      const data = await response.json();
      if (response.ok) {
        setTavilyValidationMsg("Tavily key is valid");
      } else {
        setTavilyValidationMsg(data.detail || "Invalid key");
      }
    } catch (err) {
      setTavilyValidationMsg("Connection error");
    } finally {
      setIsTavilyValidating(false);
    }
  };

  const saveCurrentConfig = () => {
    if (!configName.trim()) {
      alert("Please enter a name for this configuration");
      return;
    }
    const newSaved = [...savedConfigs, { name: configName.trim(), ...config }];
    setSavedConfigs(newSaved);
    localStorage.setItem("resector_saved_configs", JSON.stringify(newSaved));
    setConfigName("");
    alert("Configuration saved!");
  };

  const applyConfig = (saved: SavedConfig) => {
    setConfig({
      provider: saved.provider,
      apiKey: saved.apiKey,
      modelName: saved.modelName,
      tavilyApiKey: saved.tavilyApiKey || "",
      s2ApiKey: saved.s2ApiKey || "",
    });
    localStorage.setItem("resector_config", JSON.stringify(saved));
    alert(`Applied configuration: ${saved.name}`);
  };

  const deleteConfig = (index: number) => {
    const newSaved = savedConfigs.filter((_, i) => i !== index);
    setSavedConfigs(newSaved);
    localStorage.setItem("resector_saved_configs", JSON.stringify(newSaved));
  };

  const saveActiveConfig = () => {
    localStorage.setItem("resector_config", JSON.stringify(config));
    setIsOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--foreground)]"
      >
        Settings
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end"
          onClick={handleBackdropClick}
        >
          <div className="h-full w-full max-w-md overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl animate-in slide-in-from-right duration-300 sm:p-8">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-semibold">Settings</h2>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close settings"
                className="text-2xl text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
              >
                &times;
              </button>
            </div>

            <div className="space-y-8">
              <section className="space-y-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                  LLM Configuration
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[var(--muted)]">
                        AI Provider
                      </label>
                      <select
                        value={config.provider}
                        onChange={(e) =>
                          setConfig({ ...config, provider: e.target.value })
                        }
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                      >
                        <option value="groq">Groq</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="google">Google Gemini</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[var(--muted)]">
                        Model Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={config.modelName}
                        onChange={(e) =>
                          setConfig({ ...config, modelName: e.target.value })
                        }
                        placeholder="e.g. gpt-4o"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-[var(--muted)]">
                      LLM API Key
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={config.apiKey}
                        onChange={(e) =>
                          setConfig({ ...config, apiKey: e.target.value })
                        }
                        placeholder="sk-..."
                        className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                      />
                      <button
                        onClick={validateKey}
                        disabled={isValidating || !config.apiKey}
                        className="rounded-lg bg-[var(--surface-strong)] px-3 py-2 text-xs font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--border-strong)] disabled:opacity-50"
                      >
                        {isValidating ? "..." : "Test"}
                      </button>
                    </div>
                    {validationMsg && (
                      <p
                        className={`mt-1 text-[10px] font-medium ${
                          validationMsg.includes("is valid")
                            ? "text-[var(--success)]"
                            : "text-[var(--danger)]"
                        }`}
                      >
                        {validationMsg}
                      </p>
                    )}
                  </div>

                  <div className="border-t border-[var(--border)] pt-4">
                    <label className="mb-2 block text-sm font-medium text-[var(--muted)]">
                      Tavily API Key (For Web Search)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={config.tavilyApiKey}
                        onChange={(e) =>
                          setConfig({ ...config, tavilyApiKey: e.target.value })
                        }
                        placeholder="tvly-..."
                        className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                      />
                      <button
                        onClick={validateTavilyKey}
                        disabled={isTavilyValidating || !config.tavilyApiKey}
                        className="rounded-lg bg-[var(--surface-strong)] px-3 py-2 text-xs font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--border-strong)] disabled:opacity-50"
                      >
                        {isTavilyValidating ? "..." : "Test"}
                      </button>
                    </div>
                    {tavilyValidationMsg && (
                      <p
                        className={`mt-1 text-[10px] font-medium ${
                          tavilyValidationMsg.includes("is valid")
                            ? "text-[var(--success)]"
                            : "text-[var(--danger)]"
                        }`}
                      >
                        {tavilyValidationMsg}
                      </p>
                    )}
                  </div>

                  <div className="border-t border-[var(--border)] pt-4">
                    <label className="mb-2 block text-sm font-medium text-[var(--muted)]">
                      Semantic Scholar API Key (Optional)
                    </label>
                    <input
                      type="password"
                      value={config.s2ApiKey || ""}
                      onChange={(e) =>
                        setConfig({ ...config, s2ApiKey: e.target.value })
                      }
                      placeholder="Optional S2 API key for higher rate limits"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] text-[var(--subtle)]">
                      Leave empty for default unauthenticated public access.
                    </p>
                  </div>

                  <button
                    onClick={saveActiveConfig}
                    className="mt-4 w-full rounded-lg bg-[var(--accent)] py-3 font-semibold text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-strong)]"
                  >
                    Apply Configuration
                  </button>

                </div>
              </section>

              <section className="space-y-6 border-t border-[var(--border)] pt-8">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                  Saved Profiles
                </h3>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={configName}
                    onChange={(e) => setConfigName(e.target.value)}
                    placeholder="Profile name (e.g. 'Research Mode')"
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                  />
                  <button
                    onClick={saveCurrentConfig}
                    className="rounded-lg bg-[var(--surface-strong)] px-4 py-2 text-xs font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--border-strong)]"
                  >
                    Save
                  </button>
                </div>

                <div className="space-y-2">
                  {savedConfigs.length === 0 ? (
                    <p className="py-4 text-center text-sm text-[var(--subtle)]">
                      No saved profiles yet.
                    </p>
                  ) : (
                    savedConfigs.map((saved: SavedConfig) => (
                      <div
                        key={saved.name}
                        className="group flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 transition-all hover:border-[var(--border-strong)]"
                      >
                        <div>
                          <p className="text-sm font-medium text-[var(--foreground)]">
                            {saved.name}
                          </p>
                          <p className="text-[10px] uppercase text-[var(--muted)]">
                            {saved.provider}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => applyConfig(saved)}
                            className="p-2 text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                            title="Apply Profile"
                          >
                            Apply
                          </button>
                          <button
                            onClick={() => deleteConfig(savedConfigs.indexOf(saved))}
                            className="p-2 text-[var(--subtle)] transition-colors hover:text-[var(--danger)]"
                            title="Delete Profile"
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
