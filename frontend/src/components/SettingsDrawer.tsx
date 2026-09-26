"use client";

import React, { useState, useEffect } from 'react';

export default function SettingsDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState({
    provider: 'groq',
    apiKey: '',
    modelName: '',
    tavilyApiKey: ''
  });
  const [isValidating, setIsValidating] = useState(false);
  const [validationMsg, setValidationMsg] = useState('');
  const [isTavilyValidating, setIsTavilyValidating] = useState(false);
  const [tavilyValidationMsg, setTavilyValidationMsg] = useState('');
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [configName, setConfigName] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('resector_config');
    if (saved) {
      setConfig(JSON.parse(saved));
    }
    const allSaved = localStorage.getItem('resector_saved_configs');
    if (allSaved) {
      setSavedConfigs(JSON.parse(allSaved));
    }
  }, []);

  const validateKey = async () => {
    setIsValidating(true);
    setValidationMsg('');
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/validate-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          api_key: config.apiKey,
          model_name: config.modelName,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setValidationMsg('✅ Key is valid!');
      } else {
        setValidationMsg(`❌ ${data.detail || 'Invalid key'}`);
      }
    } catch (e) {
      setValidationMsg('❌ Connection error');
    } finally {
      setIsValidating(false);
    }
  };

  const validateTavilyKey = async () => {
    setIsTavilyValidating(true);
    setTavilyValidationMsg('');
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/validate-tavily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: config.tavilyApiKey,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setTavilyValidationMsg('✅ Tavily key is valid!');
      } else {
        setTavilyValidationMsg(`❌ ${data.detail || 'Invalid key'}`);
      }
    } catch (e) {
      setTavilyValidationMsg('❌ Connection error');
    } finally {
      setIsTavilyValidating(false);
    }
  };

  const saveCurrentConfig = () => {
    if (!configName) {
      alert('Please enter a name for this configuration');
      return;
    }
    const newSaved = [...savedConfigs, { name: configName, ...config }];
    setSavedConfigs(newSaved);
    localStorage.setItem('resector_saved_configs', JSON.stringify(newSaved));
    setConfigName('');
    alert('Configuration saved!');
  };

  const applyConfig = (saved) => {
    setConfig({
      provider: saved.provider,
      apiKey: saved.apiKey,
      modelName: saved.modelName,
      tavilyApiKey: saved.tavilyApiKey || '',
    });
    localStorage.setItem('resector_config', JSON.stringify(saved));
    alert(`Applied configuration: ${saved.name}`);
  };

  const deleteConfig = (index) => {
    const newSaved = savedConfigs.filter((_, i) => i !== index);
    setSavedConfigs(newSaved);
    localStorage.setItem('resector_saved_configs', JSON.stringify(newSaved));
  };

  const saveActiveConfig = () => {
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
          <div className="w-full max-w-md bg-zinc-900 h-full p-8 border-l border-zinc-800 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold">Settings</h2>
              <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-white text-2xl">&times;</button>
            </div>

            <div className="space-y-8">
              <section className="space-y-6">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">LLM Configuration</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
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
                      <label className="block text-sm font-medium text-zinc-400 mb-2">Model Name (Optional)</label>
                      <input
                        type="text"
                        value={config.modelName}
                        onChange={(e) => setConfig({...config, modelName: e.target.value})}
                        placeholder="e.g. gpt-4o"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">LLM API Key</label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={config.apiKey}
                        onChange={(e) => setConfig({...config, apiKey: e.target.value})}
                        placeholder="sk-..."
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                      />
                      <button
                        onClick={validateKey}
                        disabled={isValidating || !config.apiKey}
                        className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                      >
                        {isValidating ? '...' : 'Test'}
                      </button>
                    </div>
                    {validationMsg && (
                      <p className={`text-[10px] mt-1 font-medium ${validationMsg.includes('✅') ? 'text-green-400' : 'text-red-400'}`}>
                        {validationMsg}
                      </p>
                    )}
                  </div>

                  <div className="pt-4 border-t border-zinc-800">
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Tavily API Key (For Web Search)</label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={config.tavilyApiKey}
                        onChange={(e) => setConfig({...config, tavilyApiKey: e.target.value})}
                        placeholder="tvly-..."
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                      />
                      <button
                        onClick={validateTavilyKey}
                        disabled={isTavilyValidating || !config.tavilyApiKey}
                        className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                      >
                        {isTavilyValidating ? '...' : 'Test'}
                      </button>
                    </div>
                    {tavilyValidationMsg && (
                      <p className={`text-[10px] mt-1 font-medium ${tavilyValidationMsg.includes('✅') ? 'text-green-400' : 'text-red-400'}`}>
                        {tavilyValidationMsg}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={saveActiveConfig}
                    className="w-full py-3 bg-white text-black font-bold rounded-md hover:bg-zinc-200 transition-colors mt-4"
                  >
                    Apply Configuration
                  </button>
                </div>
              </section>

              <section className="pt-8 border-t border-zinc-800 space-y-6">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Saved Profiles</h3>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={configName}
                    onChange={(e) => setConfigName(e.target.value)}
                    placeholder="Profile name (e.g. 'Research Mode')"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                  />
                  <button
                    onClick={saveCurrentConfig}
                    className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-bold rounded-md transition-colors"
                  >
                    Save
                  </button>
                </div>

                <div className="space-y-2">
                  {savedConfigs.length === 0 ? (
                    <p className="text-sm text-zinc-600 text-center py-4">No saved profiles yet.</p>
                  ) : (
                    savedConfigs.map((saved, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-zinc-800/50 border border-zinc-800 rounded-lg group hover:border-zinc-600 transition-all">
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{saved.name}</p>
                          <p className="text-[10px] text-zinc-500 uppercase">{saved.provider}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => applyConfig(saved)}
                            className="p-2 text-zinc-400 hover:text-white transition-colors"
                            title="Apply Profile"
                          >
                            Apply
                          </button>
                          <button
                            onClick={() => deleteConfig(idx)}
                            className="p-2 text-zinc-600 hover:text-red-400 transition-colors"
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
