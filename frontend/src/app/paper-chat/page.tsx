"use client";

import React, { useState, useEffect, useRef } from 'react';
import { FileText, Upload, Send, Plus, MessageSquare, Loader2, X, Trash2, File } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function PaperChatPage() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      fetchMessages(activeSessionId);
      fetchDocuments(activeSessionId);
    }
  }, [activeSessionId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchSessions = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/sessions`);
      const data = await response.json();
      setSessions(data);
    } catch (e) {
      console.error("Failed to fetch sessions", e);
    }
  };

  const fetchMessages = async (sessionId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/sessions/${sessionId}/messages`);
      const data = await response.json();
      setMessages(data);
    } catch (e) {
      console.error("Failed to fetch messages", e);
    }
  };

  const fetchDocuments = async (sessionId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/documents/${sessionId}`);
      const data = await response.json();
      setDocuments(data);
    } catch (e) {
      console.error("Failed to fetch documents", e);
    }
  };

  const createNewSession = async () => {
    const title = prompt("Enter a title for this research session:");
    if (!title) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create session');
      }

      const data = await response.json();
      setActiveSessionId(data.session_id);
      fetchSessions();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown error occurred'}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeSessionId) {
      alert("Please create or select a session first");
      return;
    }
    if (!e.target.files || e.target.files.length === 0) return;

    const files = Array.from(e.target.files);
    setIsUploading(true);

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/upload?session_id=${activeSessionId}`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      const newQueue = files.map(f => ({ name: f.name, progress: 0, status: 'processing' }));
      setUploadQueue(newQueue);

      const pollInterval = setInterval(async () => {
        const statusRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/tasks/${data.task_id}`);
        const statusData = await statusRes.json();

        setUploadQueue(prev => prev.map(item => ({
          ...item,
          progress: statusData.progress,
          status: statusData.progress === 100 ? 'completed' : 'processing'
        })));

        if (statusData.progress === 100) {
          clearInterval(pollInterval);
          setIsUploading(false);
          fetchDocuments(activeSessionId);
        }
      }, 2000);

    } catch (e) {
      console.error("Upload failed", e);
      setIsUploading(false);
    }
  };

  const deleteDocument = async (docId: number) => {
    if (!confirm("Are you sure you want to delete this paper?")) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/documents/${docId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete document');
      fetchDocuments(activeSessionId);
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown error occurred'}`);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !activeSessionId) return;

    const config = JSON.parse(localStorage.getItem('resector_config') || '{}');

    if (!config.apiKey) {
      alert("Please set your LLM API key in Settings first.");
      return;
    }

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSessionId,
          text: userMsg,
          provider: config.provider || 'groq',
          api_key: config.apiKey,
          tavily_api_key: config.tavilyApiKey || '',
          model_name: config.modelName || '',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
          throw new Error(`Rate limit exceeded. ${errorData.detail || 'Please wait a moment before trying again.'}`);
        }
        throw new Error(errorData.detail || 'Failed to send message');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : 'Could not connect to the research agent.'}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Sidebar: Session History */}
      <div className="w-64 border-r border-zinc-800 bg-zinc-900 flex flex-col">
        <div className="p-4 border-b border-zinc-800">
          <button
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white text-black font-bold rounded-lg hover:bg-zinc-200 transition-colors"
          >
            <Plus size={16} /> New Session
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSessionId(s.id)}
              className={`w-full text-left p-3 rounded-lg transition-all flex items-center gap-3 ${
                activeSessionId === s.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <MessageSquare size={16} />
              <span className="text-sm truncate font-medium">{s.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex overflow-hidden">
        {!activeSessionId ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="p-4 bg-zinc-900 rounded-full text-zinc-500">
              <FileText size={48} />
            </div>
            <h2 className="text-2xl font-bold">Research Workspace</h2>
            <p className="text-zinc-400 max-w-md">
              Create a new session or select an existing one to start chatting with your research papers.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 flex flex-col relative overflow-hidden">
              {/* Header / Upload Zone */}
              <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <h2 className="font-bold text-lg">{sessions.find(s => s.id === activeSessionId)?.title}</h2>
                </div>

                <div className="flex items-center gap-2">
                  <label className="cursor-pointer flex items-center gap-2 py-2 px-4 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors">
                    <Upload size={16} />
                    Upload Papers
                    <input type="file" multiple accept=".pdf" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              </div>

              {/* Processing Queue Overlay */}
              {isUploading && (
                <div className="absolute top-16 right-4 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-4 z-20 animate-in slide-in-from-top-4">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Processing Papers</h3>
                    <button onClick={() => setIsUploading(false)} className="text-zinc-500 hover:text-white">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {uploadQueue.map((file, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="truncate w-32 text-zinc-300">{file.name}</span>
                          <span className="text-zinc-500">{file.progress}%</span>
                        </div>
                        <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-white transition-all duration-500"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-2xl p-4 rounded-2xl ${
                      m.role === 'user'
                        ? 'bg-white text-black rounded-tr-none'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-tl-none prose prose-invert max-w-none'
                    }`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))}
                <div ref={scrollRef} />
              </div>

              {/* Input Area */}
              <div className="p-6 bg-gradient-to-t from-zinc-950 to-transparent">
                <div className="max-w-3xl mx-auto relative">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Ask your papers a question..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 pr-16 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 transition-all resize-none h-24 shadow-xl"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isLoading || !input.trim()}
                    className="absolute right-3 bottom-3 p-3 bg-white text-black rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Sidebar: Uploaded Papers */}
            <div className="w-72 border-l border-zinc-800 bg-zinc-900/30 flex flex-col">
              <div className="p-4 border-b border-zinc-800">
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Documents</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {documents.length === 0 ? (
                  <p className="text-xs text-zinc-600 text-center py-8">No papers uploaded yet.</p>
                ) : (
                  documents.map(doc => (
                    <div key={doc.id} className="group flex items-center justify-between p-2 bg-zinc-800/50 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-all">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <File size={14} className="text-zinc-500 shrink-0" />
                        <span className="text-xs truncate text-zinc-300">{doc.filename}</span>
                      </div>
                      <button
                        onClick={() => deleteDocument(doc.id)}
                        className="p-1 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete paper"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
