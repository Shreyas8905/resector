"use client";

import React, { useState, useEffect } from 'react';

export default function SettingsDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState({
    provider: 'groq',
    apiKey: '',
    modelName: ''
  });

  useEffect(() => {
    const saved = localStorage.getItem('resector_config');
    if (saved) {
      setConfig(JSON.parse(saved));
    }
  }, []);

  const saveConfig = () => {
    localStorage.setItem('resector_config', JSON.stringify(config));
    setIsOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm transition-colors"
      >
        Settings
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-md bg-zinc-900 h-full p-8 border-l border-zinc-800 shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold">Settings</h2>
              <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-white text-2xl">&times;</button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">AI Provider</label>
                <select
                  value={config.provider}
                  onChange={(e) => setConfig({...config, provider: e.target.value})}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                >
                  <option value="groq">Groq</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google Gemini</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">API Key</label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig({...config, apiKey: e.target.value})}
                  placeholder="sk-..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Model Name (Optional)</label>
                <input
                  type="text"
                  value={config.modelName}
                  onChange={(e) => setConfig({...config, modelName: e.target.value})}
                  placeholder="e.g. llama-3.3-70b-versatile"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                />
              </div>

              <button
                onClick={saveConfig}
                className="w-full py-3 bg-white text-black font-bold rounded-md hover:bg-zinc-200 transition-colors mt-8"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
