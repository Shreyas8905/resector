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
  User,
  Paperclip,
  Network,
  Sparkles,
  Copy,
  Check,
  MoreVertical,
  RotateCcw,
  BookOpen,
  FileText,
  HelpCircle,
  Search,
  ExternalLink,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import PaperGraphView from "@/components/PaperGraphView";

interface Session {
  id: string;
  title: string;
  updated_at?: string;
}

interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

interface DocumentItem {
  id: number;
  filename: string;
  status?: string;
  progress?: number;
}

interface UploadItem {
  name: string;
  progress: number;
  status: "processing" | "completed";
}

const STARTER_PROMPTS = [
  {
    title: "Synthesize Core Findings",
    prompt: "Provide a comprehensive summary of the key findings, methodology, and empirical results in these papers.",
    icon: Sparkles,
  },
  {
    title: "Methodological Critique",
    prompt: "Critique the experimental design and theoretical assumptions made by the authors. What are the major limitations?",
    icon: HelpCircle,
  },
  {
    title: "Extract Comparative Metrics",
    prompt: "Compare performance benchmarks, dataset statistics, and baseline comparisons reported across the uploaded papers in a table format.",
    icon: BookOpen,
  },
  {
    title: "Future Research Directions",
    prompt: "What open problems and unanswered questions do the authors propose for future work?",
    icon: FileText,
  },
];

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
  const [activeView, setActiveView] = useState<"chat" | "graph">("chat");
  const [selectedPaperForGraph, setSelectedPaperForGraph] = useState<string>("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [sessionSearchQuery, setSessionSearchQuery] = useState("");
  const [hoveredMessageIndex, setHoveredMessageIndex] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      fetchMessages(activeSessionId);
      fetchDocuments(activeSessionId);
    } else {
      setMessages([]);
      setDocuments([]);
    }
  }, [activeSessionId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const fetchSessions = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/chat/sessions`,
      );
      if (!response.ok) return;
      const data = await response.json();
      setSessions(data);
      if (data.length > 0 && !activeSessionId) {
        setActiveSessionId(data[0].id);
      }
    } catch (e) {
      console.error("Failed to fetch sessions", e);
    }
  };

  const fetchMessages = async (sessionId: string) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/chat/sessions/${sessionId}/messages`,
      );
      if (!response.ok) return;
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
      if (!response.ok) return;
      const data = await response.json();
      setDocuments(data);
    } catch (e) {
      console.error("Failed to fetch documents", e);
    }
  };

  const createNewSession = async () => {
    const title = prompt("Enter a title for this research session:", "New Research Session");
    if (!title || !title.trim()) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/chat/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim() }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to create session");
      }

      const data = await response.json();
      await fetchSessions();
      setActiveSessionId(data.session_id);
    } catch (e) {
      alert(
        `Error: ${e instanceof Error ? e.message : "Unknown error occurred"}`,
      );
    }
  };

  const deleteSession = async (sessionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm("Are you sure you want to delete this session and all its messages and papers?")) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/chat/sessions/${sessionId}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to delete session");

      const remaining = sessions.filter((s) => s.id !== sessionId);
      setSessions(remaining);
      if (activeSessionId === sessionId) {
        setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Could not delete session"}`);
    }
  };

  const clearChatHistory = async () => {
    if (!activeSessionId) return;
    if (!confirm("Are you sure you want to clear all chat messages in this conversation?")) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/chat/sessions/${activeSessionId}/messages`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to clear messages");
      setMessages([]);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Could not clear messages"}`);
    }
  };

  const deleteSingleMessage = async (index: number, msgId?: number) => {
    if (!confirm("Delete this message?")) return;

    if (msgId) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/messages/${msgId}`, {
          method: "DELETE",
        });
      } catch (err) {
        console.error("Failed to delete message on backend", err);
      }
    }
    setMessages((prev) => prev.filter((_, i) => i !== index));
  };

  const copyMessageContent = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
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
          // Set the uploaded file as the target for the citation network
          const cleanName = files[0].name.replace(/\.pdf$/i, "").replace(/^[0-9a-fA-F-]+_/, "").replace(/_/g, " ");
          setSelectedPaperForGraph(cleanName);
        }
      }, 1500);
    } catch (e) {
      console.error("Upload failed", e);
      setIsUploading(false);
    }
  };

  const openCitationNetworkForDoc = (filename: string) => {
    const cleanTitle = filename.replace(/\.pdf$/i, "").replace(/^[0-9a-fA-F-]+_/, "").replace(/_/g, " ");
    setSelectedPaperForGraph(cleanTitle);
    setActiveView("graph");
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

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || input;
    if (!textToSend.trim() || !activeSessionId) return;

    const config = JSON.parse(localStorage.getItem("resector_config") || "{}");

    if (!config.apiKey) {
      alert("Please configure your LLM API key in the Settings Drawer (gear icon).");
      return;
    }

    const userMsg = textToSend;
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
            `Rate limit reached. ${errorData.detail || "Please wait a moment before trying again."}`,
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
          content: `⚠️ **Error encountered**: ${e instanceof Error ? e.message : "Could not connect to the research agent."}`,
        },
      ]);
    } finally {
      setIsLoading(false);
      // Refocus textarea
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(sessionSearchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full min-h-0 bg-[var(--background)] text-[var(--foreground)] font-sans">
      {/* Left Sidebar: Session History */}
      <div
        className={`${isSessionPaneOpen ? "max-md:flex" : "max-md:hidden"} flex w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] max-lg:w-60 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-72 shadow-lg md:shadow-none transition-all`}
      >
        {/* Sidebar Header & New Session */}
        <div className="p-3 border-b border-[var(--border)] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              Sessions ({sessions.length})
            </span>
            <button
              onClick={() => setIsSessionPaneOpen(false)}
              className="md:hidden p-1 text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <X size={16} />
            </button>
          </div>
          <button
            onClick={createNewSession}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--accent-contrast)] shadow-sm transition-all hover:bg-[var(--accent-strong)] hover:shadow active:scale-[0.98]"
          >
            <Plus size={15} /> New Research Session
          </button>
        </div>

        {/* Session Filter */}
        {sessions.length > 5 && (
          <div className="px-3 pt-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-[var(--muted)]" />
              <input
                type="text"
                value={sessionSearchQuery}
                onChange={(e) => setSessionSearchQuery(e.target.value)}
                placeholder="Search sessions..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] py-1.5 pl-8 pr-2 text-xs text-[var(--foreground)] placeholder:text-[var(--subtle)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Sessions List */}
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {filteredSessions.length === 0 ? (
            <div className="p-4 text-center text-xs text-[var(--subtle)]">
              {sessionSearchQuery ? "No matching sessions" : "No sessions yet. Start one!"}
            </div>
          ) : (
            filteredSessions.map((s) => {
              const isActive = activeSessionId === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    setActiveSessionId(s.id);
                    setIsSessionPaneOpen(false);
                  }}
                  className={`group relative flex items-center justify-between rounded-xl p-2.5 cursor-pointer transition-all ${
                    isActive
                      ? "bg-[var(--surface-strong)] text-[var(--foreground)] font-semibold shadow-sm border border-[var(--border-strong)]"
                      : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-1">
                    <MessageSquare size={15} className={`shrink-0 ${isActive ? "text-[var(--accent)]" : "text-[var(--subtle)]"}`} />
                    <span className="text-xs truncate">{s.title}</span>
                  </div>
                  <button
                    onClick={(e) => deleteSession(s.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-[var(--subtle)] hover:text-[var(--danger)] hover:bg-[var(--surface-strong)] rounded-md transition-all shrink-0"
                    title="Delete session"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 min-h-0 min-w-0 flex overflow-hidden">
        {!activeSessionId ? (
          <div className="flex flex-1 flex-col items-center justify-center space-y-5 p-8 text-center bg-[var(--background)]">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30 shadow-lg">
              <Bot size={32} />
            </div>
            <div className="max-w-md space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
                Resector Paper Chat
              </h2>
              <p className="text-sm text-[var(--muted)] leading-relaxed">
                Start a research session, upload PDF scientific papers, and interact with an AI research agent grounded in your paper collection.
              </p>
            </div>
            <button
              onClick={createNewSession}
              className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] shadow-md hover:bg-[var(--accent-strong)] transition-all active:scale-95"
            >
              <Plus size={16} /> Create Research Session
            </button>
          </div>
        ) : (
          <>
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--background)]">
              {/* Header Bar */}
              <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 shrink-0 z-10 shadow-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex gap-1 md:hidden">
                    <button
                      onClick={() => setIsSessionPaneOpen((isOpen) => !isOpen)}
                      className="rounded-lg bg-[var(--surface-strong)] px-2.5 py-1 text-xs font-semibold text-[var(--foreground)]"
                    >
                      Sessions
                    </button>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-[var(--success)] animate-pulse" />
                      <h2 className="text-sm font-bold truncate text-[var(--foreground)] max-w-xs md:max-w-md">
                        {sessions.find((s) => s.id === activeSessionId)?.title}
                      </h2>
                    </div>
                    <p className="text-[10px] text-[var(--muted)] truncate">
                      {documents.length} paper{documents.length === 1 ? "" : "s"} loaded • {messages.length} messages
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* View Mode Switcher: Chat vs Citation Network */}
                  <div className="flex rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-0.5">
                    <button
                      onClick={() => setActiveView("chat")}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                        activeView === "chat"
                          ? "bg-[var(--surface)] text-[var(--foreground)] shadow-xs font-semibold"
                          : "text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      <MessageSquare size={13} />
                      <span>Chat</span>
                    </button>
                    <button
                      onClick={() => {
                        if (documents.length > 0 && !selectedPaperForGraph) {
                          openCitationNetworkForDoc(documents[0].filename);
                        } else {
                          setActiveView("graph");
                        }
                      }}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                        activeView === "graph"
                          ? "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-xs font-bold"
                          : "text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      <Network size={13} />
                      <span className="hidden sm:inline">50-Paper Citation Network</span>
                      <span className="sm:hidden">Network</span>
                    </button>
                  </div>

                  {/* Clear chat history action */}
                  {messages.length > 0 && activeView === "chat" && (
                    <button
                      onClick={clearChatHistory}
                      className="hidden sm:flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--danger)] hover:border-[var(--danger)] transition-all"
                      title="Clear chat messages"
                    >
                      <Trash2 size={13} />
                      <span>Clear Chat</span>
                    </button>
                  )}

                  {/* Upload button */}
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition-all hover:border-[var(--accent)] hover:bg-[var(--surface-strong)]">
                    <Upload size={13} className="text-[var(--accent)]" />
                    <span className="hidden sm:inline">Upload PDF</span>
                    <input
                      type="file"
                      multiple
                      accept=".pdf"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>

                  {/* Toggle Document sidebar button */}
                  <button
                    onClick={() => setIsDocumentPaneOpen((isOpen) => !isOpen)}
                    className="flex md:hidden items-center gap-1 rounded-lg bg-[var(--surface-strong)] px-2.5 py-1.5 text-xs font-semibold text-[var(--foreground)]"
                  >
                    <File size={13} />
                    <span>Papers ({documents.length})</span>
                  </button>
                </div>
              </div>

              {/* Upload Progress Overlay */}
              {isUploading && (
                <div className="absolute right-4 top-14 z-30 w-72 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-2xl animate-in slide-in-from-top-3">
                  <div className="flex justify-between items-center mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
                        Indexing Papers
                      </h3>
                    </div>
                    <button
                      onClick={() => setIsUploading(false)}
                      className="text-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    {uploadQueue.map((file, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="w-36 truncate font-medium text-[var(--foreground)]">
                            {file.name}
                          </span>
                          <span className="font-semibold text-[var(--accent)]">
                            {file.progress}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-strong)]">
                          <div
                            className="h-full bg-[var(--accent)] transition-all duration-300 rounded-full"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Main Content Pane */}
              {activeView === "graph" ? (
                <div className="flex-1 min-h-0 overflow-hidden">
                  <PaperGraphView
                    initialQuery={
                      selectedPaperForGraph ||
                      (documents.length > 0
                        ? documents[0].filename.replace(/\.pdf$/i, "").replace(/^[0-9a-fA-F-]+_/, "").replace(/_/g, " ")
                        : "")
                    }
                  />
                </div>
              ) : (
                <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                  {/* Active Document Helper Banner */}
                  {documents.length > 0 && (
                    <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-muted)]/60 px-4 py-1.5 text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <FileText size={13} className="shrink-0 text-[var(--accent)]" />
                        <span className="truncate text-[var(--muted)]">
                          Active Grounding: <strong className="text-[var(--foreground)]">{documents[0].filename}</strong>
                          {documents.length > 1 && ` (+${documents.length - 1} more)`}
                        </span>
                      </div>
                      <button
                        onClick={() => openCitationNetworkForDoc(documents[0].filename)}
                        className="flex shrink-0 items-center gap-1 font-semibold text-[var(--accent)] hover:underline ml-2"
                      >
                        <Network size={12} />
                        <span>Visualize 50-Paper Network</span>
                      </button>
                    </div>
                  )}

                  {/* Messages Area */}
                  <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 space-y-6">
                    {messages.length === 0 ? (
                      /* Empty State: Immersive Starter Cards */
                      <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center space-y-6 py-12 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
                          <Sparkles size={24} />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-lg font-bold text-[var(--foreground)]">
                            {documents.length > 0
                              ? "Ready to query your papers"
                              : "Start your research dialogue"}
                          </h3>
                          <p className="text-xs text-[var(--muted)] max-w-md">
                            {documents.length > 0
                              ? "Ask any question about your uploaded research documents or choose an analytical query below."
                              : "Upload research papers using the button above to ground the AI assistant in your literature."}
                          </p>
                        </div>

                        {/* Starter Prompt Cards */}
                        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 text-left pt-2">
                          {STARTER_PROMPTS.map((starter, i) => {
                            const IconComponent = starter.icon;
                            return (
                              <button
                                key={i}
                                onClick={() => handleSendMessage(starter.prompt)}
                                className="group flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 transition-all hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] hover:shadow-sm"
                              >
                                <div className="flex items-center gap-2 mb-1.5">
                                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-contrast)] transition-colors">
                                    <IconComponent size={13} />
                                  </div>
                                  <span className="text-xs font-bold text-[var(--foreground)]">
                                    {starter.title}
                                  </span>
                                </div>
                                <p className="text-[11px] text-[var(--muted)] line-clamp-2 leading-relaxed">
                                  {starter.prompt}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      /* Chat Messages Feed */
                      messages.map((m, i) => {
                        const isUser = m.role === "user";
                        const isHovered = hoveredMessageIndex === i;

                        return (
                          <div
                            key={i}
                            onMouseEnter={() => setHoveredMessageIndex(i)}
                            onMouseLeave={() => setHoveredMessageIndex(null)}
                            className={`group mx-auto flex w-full max-w-3xl gap-3 transition-all ${
                              isUser ? "justify-end" : "justify-start"
                            }`}
                          >
                            {/* Assistant Avatar */}
                            {!isUser && (
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm mt-0.5">
                                <Bot size={16} />
                              </div>
                            )}

                            {/* Bubble Container */}
                            <div className={`relative max-w-[85%] ${isUser ? "text-right" : "text-left"}`}>
                              {/* Header Meta */}
                              <div className={`flex items-center gap-2 mb-1 px-1 text-[10px] text-[var(--subtle)] ${isUser ? "justify-end" : "justify-start"}`}>
                                <span className="font-semibold text-[var(--muted)]">
                                  {isUser ? "You" : "Resector Assistant"}
                                </span>
                              </div>

                              {/* Message Body */}
                              <div
                                className={`rounded-2xl px-4 py-3.5 text-sm leading-relaxed transition-all shadow-xs ${
                                  isUser
                                    ? "bg-[var(--accent)] text-[var(--accent-contrast)] font-medium rounded-tr-xs"
                                    : "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] rounded-tl-xs"
                                }`}
                              >
                                {isUser ? (
                                  <div className="whitespace-pre-wrap">{m.content}</div>
                                ) : (
                                  <div className="prose text-sm max-w-none break-words">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {m.content}
                                    </ReactMarkdown>
                                  </div>
                                )}
                              </div>

                              {/* Action Toolbar (Copy & Delete Message) */}
                              <div
                                className={`flex items-center gap-1.5 mt-1 px-1 transition-opacity ${
                                  isHovered ? "opacity-100" : "opacity-0"
                                } ${isUser ? "justify-end" : "justify-start"}`}
                              >
                                <button
                                  onClick={() => copyMessageContent(m.content, i)}
                                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] transition-colors"
                                  title="Copy message"
                                >
                                  {copiedIndex === i ? (
                                    <>
                                      <Check size={11} className="text-[var(--success)]" />
                                      <span className="text-[var(--success)]">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={11} />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  onClick={() => deleteSingleMessage(i, m.id)}
                                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--danger)] transition-colors"
                                  title="Delete this message"
                                >
                                  <Trash2 size={11} />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </div>

                            {/* User Avatar */}
                            {isUser && (
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-strong)] text-[var(--foreground)] border border-[var(--border)] mt-0.5">
                                <User size={16} />
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}

                    {/* Agent Thinking / Loading Indicator */}
                    {isLoading && (
                      <div className="mx-auto flex w-full max-w-3xl gap-3 animate-in fade-in-50 duration-300">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm">
                          <Bot size={16} />
                        </div>
                        <div className="rounded-2xl rounded-tl-xs border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--muted)] shadow-xs flex items-center gap-2">
                          <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
                          <span>Synthesizing paper context and formulating response...</span>
                        </div>
                      </div>
                    )}
                    <div ref={scrollRef} />
                  </div>

                  {/* Input & Prompt Area */}
                  <div className="border-t border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4 shrink-0">
                    <div className="relative mx-auto max-w-3xl">
                      <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="Ask anything about your research papers, extract methodologies, synthesize findings..."
                        rows={2}
                        className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3.5 pb-10 pr-24 text-sm text-[var(--foreground)] placeholder:text-[var(--subtle)] focus:border-[var(--accent)] focus:outline-none transition-all shadow-inner"
                      />

                      {/* Footer Actions Inside Input Box */}
                      <div className="absolute bottom-2.5 left-3 flex items-center gap-2">
                        <label
                          className="flex h-7 cursor-pointer items-center gap-1 rounded-lg bg-[var(--surface-muted)] px-2.5 text-[11px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
                          title="Attach PDFs"
                        >
                          <Paperclip size={13} />
                          <span>Attach PDF</span>
                          <input
                            type="file"
                            multiple
                            accept=".pdf"
                            className="hidden"
                            onChange={handleFileUpload}
                          />
                        </label>
                      </div>

                      <div className="absolute bottom-2.5 right-3 flex items-center gap-2">
                        <button
                          onClick={() => handleSendMessage()}
                          disabled={isLoading || !input.trim()}
                          aria-label="Send message"
                          className="flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 py-1.5 text-xs font-bold text-[var(--accent-contrast)] shadow-sm transition-all hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="animate-spin" size={13} />
                              <span>Thinking</span>
                            </>
                          ) : (
                            <>
                              <span>Send</span>
                              <Send size={12} />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Sidebar: Uploaded Papers & Grounding */}
            <div
              className={`${isDocumentPaneOpen ? "max-md:flex" : "max-md:hidden"} flex w-72 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)] max-lg:w-60 max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:w-72 shadow-lg md:shadow-none transition-all`}
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] p-3">
                <div className="flex items-center gap-1.5">
                  <FileText size={14} className="text-[var(--accent)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                    Papers ({documents.length})
                  </h3>
                </div>
                <button
                  onClick={() => setIsDocumentPaneOpen(false)}
                  className="md:hidden p-1 text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                {documents.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <BookOpen size={24} className="mx-auto text-[var(--subtle)]" />
                    <p className="text-xs font-medium text-[var(--subtle)]">
                      No papers uploaded yet.
                    </p>
                    <label className="inline-block cursor-pointer rounded-lg bg-[var(--surface-muted)] px-3 py-1.5 text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--surface-strong)] transition-colors">
                      Upload PDF
                      <input
                        type="file"
                        multiple
                        accept=".pdf"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>
                ) : (
                  documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="group flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 transition-all hover:border-[var(--accent)] hover:shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 overflow-hidden">
                          <File
                            size={14}
                            className="shrink-0 text-[var(--accent)] mt-0.5"
                          />
                          <span
                            className="text-xs font-semibold text-[var(--foreground)] line-clamp-2"
                            title={doc.filename}
                          >
                            {doc.filename}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteDocument(doc.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--subtle)] hover:text-[var(--danger)] hover:bg-[var(--surface-strong)] rounded-md transition-all shrink-0"
                          title="Delete paper"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* View 50-Paper Citation Network Action */}
                      <button
                        onClick={() => openCitationNetworkForDoc(doc.filename)}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--surface)] py-1.5 text-[11px] font-bold text-[var(--accent)] border border-[var(--border)] transition-all hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] hover:border-[var(--accent)] shadow-xs active:scale-[0.98]"
                        title="Generate and explore 50-Paper Citation Network"
                      >
                        <Network size={12} />
                        <span>50-Paper Network</span>
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


