"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Upload,
  Send,
  Plus,
  MessageSquare,
  Loader2,
  X,
  Trash2,
  File,
  Bot,
  Paperclip,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Session {
  id: string;
  title: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface DocumentItem {
  id: number;
  filename: string;
}

interface UploadItem {
  name: string;
  progress: number;
  status: "processing" | "completed";
}

export default function PaperChatPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionPaneOpen, setIsSessionPaneOpen] = useState(false);
  const [isDocumentPaneOpen, setIsDocumentPaneOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchSessions = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/chat/sessions`,
      );
      const data = await response.json();
      setSessions(data);
    } catch (e) {
      console.error("Failed to fetch sessions", e);
    }
  };

  const fetchMessages = async (sessionId: string) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/chat/sessions/${sessionId}/messages`,
      );
      const data = await response.json();
      setMessages(data);
    } catch (e) {
      console.error("Failed to fetch messages", e);
    }
  };

  const fetchDocuments = async (sessionId: string) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/chat/documents/${sessionId}`,
      );
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
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/chat/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to create session");
      }

      const data = await response.json();
      setActiveSessionId(data.session_id);
      fetchSessions();
    } catch (e) {
      alert(
        `Error: ${e instanceof Error ? e.message : "Unknown error occurred"}`,
      );
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeSessionId) {
      alert("Please create or select a session first");
      return;
    }
    const sessionId = activeSessionId;
    if (!e.target.files || e.target.files.length === 0) return;

    const files = Array.from(e.target.files);
    setIsUploading(true);

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/chat/upload?session_id=${sessionId}`,
        {
          method: "POST",
          body: formData,
        },
      );
      const data = await response.json();

      const newQueue = files.map((f) => ({
        name: f.name,
        progress: 0,
        status: "processing" as const,
      }));
      setUploadQueue(newQueue);

      const pollInterval = setInterval(async () => {
        const statusRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/chat/tasks/${data.task_id}`,
        );
        const statusData = await statusRes.json();

        setUploadQueue((prev) =>
          prev.map((item) => ({
            ...item,
            progress: statusData.progress,
            status: statusData.progress === 100 ? "completed" : "processing",
          })),
        );

        if (statusData.progress === 100) {
          clearInterval(pollInterval);
          setIsUploading(false);
          fetchDocuments(sessionId);
        }
      }, 2000);
    } catch (e) {
      console.error("Upload failed", e);
      setIsUploading(false);
    }
  };

  const deleteDocument = async (docId: number) => {
    if (!activeSessionId) return;
    if (!confirm("Are you sure you want to delete this paper?")) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/chat/documents/${docId}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) throw new Error("Failed to delete document");
      fetchDocuments(activeSessionId);
    } catch (e) {
      alert(
        `Error: ${e instanceof Error ? e.message : "Unknown error occurred"}`,
      );
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !activeSessionId) return;

    const config = JSON.parse(localStorage.getItem("resector_config") || "{}");

    if (!config.apiKey) {
      alert("Please set your LLM API key in Settings first.");
      return;
    }

    const userMsg = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/chat/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: activeSessionId,
            text: userMsg,
            provider: config.provider || "groq",
            api_key: config.apiKey,
            tavily_api_key: config.tavilyApiKey || "",
            model_name: config.modelName || "",
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
          throw new Error(
            `Rate limit exceeded. ${errorData.detail || "Please wait a moment before trying again."}`,
          );
        }
        throw new Error(errorData.detail || "Failed to send message");
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${e instanceof Error ? e.message : "Could not connect to the research agent."}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 bg-[var(--background)] text-[var(--foreground)]">
      {/* Sidebar: Session History */}
      <div
        className={`${isSessionPaneOpen ? "max-md:flex" : "max-md:hidden"} flex w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] max-lg:w-56 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-30 max-md:w-72`}
      >
        <div className="border-b border-[var(--border)] p-3">
          <button
            onClick={createNewSession}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
          >
            <Plus size={16} /> New Session
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSessionId(s.id)}
              className={`w-full text-left p-3 rounded-lg transition-all flex items-center gap-3 ${
                activeSessionId === s.id
                  ? "bg-[var(--surface-strong)] text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
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
          <div className="flex flex-1 flex-col items-center justify-center space-y-5 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[var(--shadow)]">
              <Bot size={26} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Paper Chat
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Select a conversation or start a new one.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
              {/* Header / Upload Zone */}
              <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1 md:hidden">
                    <button
                      onClick={() => setIsSessionPaneOpen((isOpen) => !isOpen)}
                      className="rounded-lg bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--foreground)]"
                    >
                      Sessions
                    </button>
                    <button
                      onClick={() => setIsDocumentPaneOpen((isOpen) => !isOpen)}
                      className="rounded-lg bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--foreground)]"
                    >
                      Papers
                    </button>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--subtle)]">
                      Paper Chat
                    </p>
                    <h2 className="text-sm font-semibold">
                      {sessions.find((s) => s.id === activeSessionId)?.title}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--foreground)]">
                    <Upload size={16} />
                    <span className="hidden sm:inline">Upload Papers</span>
                    <input
                      type="file"
                      multiple
                      accept=".pdf"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>
                </div>
              </div>

              {/* Processing Queue Overlay */}
              {isUploading && (
                <div className="absolute right-4 top-16 z-20 w-64 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl animate-in slide-in-from-top-4">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                      Processing Papers
                    </h3>
                    <button
                      onClick={() => setIsUploading(false)}
                      className="text-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {uploadQueue.map((file, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="w-32 truncate text-[var(--foreground)]">
                            {file.name}
                          </span>
                          <span className="text-[var(--muted)]">
                            {file.progress}%
                          </span>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-strong)]">
                          <div
                            className="h-full bg-[var(--accent)] transition-all duration-500"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`mx-auto flex w-full max-w-3xl gap-3 py-5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7 ${
                        m.role === "user"
                          ? "bg-[var(--surface-strong)] text-[var(--foreground)]"
                          : "prose max-w-none rounded-none border-0 bg-transparent p-0 text-[var(--foreground)]"
                      }`}
                    >
                      {m.role === "assistant" && (
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--accent-strong)]">
                          <Bot size={15} /> Research assistant
                        </div>
                      )}
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))}
                <div ref={scrollRef} />
              </div>

              {/* Input Area */}
              <div className="bg-gradient-to-t from-[var(--background)] via-[var(--background)]/95 to-transparent px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
                <div className="relative mx-auto max-w-3xl">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Message your papers..."
                    className="h-28 w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 pb-12 pr-16 text-[var(--foreground)] shadow-[var(--shadow)] transition-all placeholder:text-[var(--subtle)] focus:border-[var(--accent)] focus:outline-none"
                  />
                  <label
                    className="absolute bottom-3 left-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                    title="Upload papers"
                  >
                    <Paperclip size={18} />
                    <input
                      type="file"
                      multiple
                      accept=".pdf"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>
                  <button
                    onClick={handleSendMessage}
                    disabled={isLoading || !input.trim()}
                    aria-label="Send message"
                    className="absolute bottom-3 right-3 rounded-xl bg-[var(--accent)] p-2.5 text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-strong)] disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="animate-spin" size={20} />
                    ) : (
                      <Send size={20} />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Sidebar: Uploaded Papers */}
            <div
              className={`${isDocumentPaneOpen ? "max-md:flex" : "max-md:hidden"} flex w-64 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)] max-lg:w-56 max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-30 max-md:w-72`}
            >
              <div className="border-b border-[var(--border)] p-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                  Documents
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {documents.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[var(--subtle)]">
                    No papers uploaded yet.
                  </p>
                ) : (
                  documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="group flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2 transition-all hover:border-[var(--border-strong)]"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <File
                          size={14}
                          className="shrink-0 text-[var(--muted)]"
                        />
                        <span className="truncate text-xs text-[var(--foreground)]">
                          {doc.filename}
                        </span>
                      </div>
                      <button
                        onClick={() => deleteDocument(doc.id)}
                        className="p-1 text-[var(--subtle)] opacity-0 transition-colors hover:text-[var(--danger)] group-hover:opacity-100"
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
