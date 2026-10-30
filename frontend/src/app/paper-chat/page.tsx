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
  Paperclip,
  Network,
  Sparkles,
  Copy,
  Check,
  BookOpen,
  FileText,
  HelpCircle,
  Search,
} from "lucide-react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import PaperGraphView from "@/components/PaperGraphView";
import { FigureCards, FigureInfo } from "@/components/FigureCards";
import { getAnalyzeFigures, setAnalyzeFigures } from "@/lib/figureSettings";
import { friendlyError, errorText, openSettings } from "@/lib/errors";
import { useDialogs } from "@/components/ui/Dialogs";
import { ResizeHandle, panelStyle, usePanelWidth } from "@/components/ui/Resizable";

interface Session {
  id: string;
  title: string;
  updated_at?: string;
}

interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
  figures?: FigureInfo[];
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
    title: "Summarize the key findings",
    prompt: "Provide a comprehensive summary of the key findings, methodology, and empirical results in these papers.",
    icon: Sparkles,
  },
  {
    title: "Critique the methods",
    prompt: "Critique the experimental design and theoretical assumptions made by the authors. What are the major limitations?",
    icon: HelpCircle,
  },
  {
    title: "Compare results in a table",
    prompt: "Compare performance benchmarks, dataset statistics, and baseline comparisons reported across the uploaded papers in a table format.",
    icon: BookOpen,
  },
  {
    title: "Find open questions",
    prompt: "What open problems and unanswered questions do the authors propose for future work?",
    icon: FileText,
  },
];

export default function PaperChatPage() {
  const { confirm, ask, notify, dialogs } = useDialogs();
  const sessionsPanel = usePanelWidth("chat_sessions", 256, 200, 420);
  const papersPanel = usePanelWidth("chat_papers", 256, 200, 480);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [analyzeFigures, setAnalyzeFiguresState] = useState(false);
  useEffect(() => {
    setAnalyzeFiguresState(getAnalyzeFigures());
  }, []);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionPaneOpen, setIsSessionPaneOpen] = useState(false);
  const [isDocumentPaneOpen, setIsDocumentPaneOpen] = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "graph">("chat");
  const [selectedPaperForGraph, setSelectedPaperForGraph] = useState<string>("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [sessionSearchQuery, setSessionSearchQuery] = useState("");

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
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
    const title = await ask({
      title: "New research session",
      message: "A session keeps one set of papers and the conversation about them together.",
      label: "Session name",
      initial: "New Research Session",
      confirmLabel: "Create session",
    });
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
      notify(e instanceof Error ? e.message : "Could not create the session.", "error");
    }
  };

  const deleteSession = async (sessionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!(await confirm({ title: "Delete this session?", message: "Its messages and uploaded papers will be removed. This can’t be undone.", danger: true }))) return;

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
      notify(err instanceof Error ? err.message : "Could not delete the session.", "error");
    }
  };

  const clearChatHistory = async () => {
    if (!activeSessionId) return;
    if (!(await confirm({ title: "Clear this conversation?", message: "All messages in this session will be removed. Your papers stay.", confirmLabel: "Clear chat", danger: true }))) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/chat/sessions/${activeSessionId}/messages`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to clear messages");
      setMessages([]);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not clear the messages.", "error");
    }
  };

  const deleteSingleMessage = async (index: number, msgId?: number) => {
    if (!(await confirm({ title: "Delete this message?", danger: true }))) return;

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
      notify("Create or select a session first.", "error");
      return;
    }
    const sessionId = activeSessionId;
    if (!e.target.files || e.target.files.length === 0) return;

    const files = Array.from(e.target.files);
    setIsUploading(true);

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    if (analyzeFigures) {
      // Opt-in: a vision model reads each figure (about 1 API call per figure).
      const cfg = JSON.parse(localStorage.getItem("resector_config") || "{}");
      if (cfg.apiKey) {
        formData.append("analyze_figures", "true");
        formData.append("provider", cfg.provider || "groq");
        formData.append("api_key", cfg.apiKey);
        if (cfg.modelName) formData.append("model_name", cfg.modelName);
      }
    }

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
    if (!(await confirm({ title: "Remove this paper?", message: "It will no longer be used to answer questions in this session.", confirmLabel: "Remove", danger: true }))) return;

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
      notify(e instanceof Error ? e.message : "Could not remove the paper.", "error");
    }
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || input;
    if (!textToSend.trim() || !activeSessionId) return;

    const config = JSON.parse(localStorage.getItem("resector_config") || "{}");

    if (!config.apiKey) {
      openSettings();
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
        { role: "assistant", content: data.answer, figures: data.figures || [] },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ ${friendlyError(e)}\n\n> Technical details: ${errorText(e).replace(/\s+/g, " ").slice(0, 240)}`,
        },
      ]);
    } finally {
      setIsLoading(false);
      // Refocus textarea
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(sessionSearchQuery.toLowerCase())
  );

  const activeTitle = sessions.find((s) => s.id === activeSessionId)?.title;

  return (
    <div className="relative flex h-full min-h-0 bg-[var(--background)] text-[var(--foreground)]">
      {dialogs}
      {(isSessionPaneOpen || isDocumentPaneOpen) && (
        <button
          aria-label="Close panel"
          className="anim-fade absolute inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => {
            setIsSessionPaneOpen(false);
            setIsDocumentPaneOpen(false);
          }}
        />
      )}

      {/* Sessions */}
      <aside
        aria-label="Sessions" style={panelStyle(sessionsPanel.width)}
        className={`${isSessionPaneOpen ? "max-md:flex" : "max-md:hidden"} flex w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:relative md:w-[var(--panel-w)] max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-72 max-md:shadow-[var(--shadow-pop)]`}
      >
        <ResizeHandle panel={sessionsPanel} edge="right" label="Resize the chats panel" />
        <div className="space-y-3 p-3">
          <div className="flex items-center justify-between md:hidden">
            <span className="text-sm font-semibold">Sessions</span>
            <button onClick={() => setIsSessionPaneOpen(false)} className="icon-btn !h-8 !w-8" aria-label="Close sessions">
              <X size={16} />
            </button>
          </div>
          <button onClick={createNewSession} className="btn btn-primary w-full">
            <Plus size={15} /> New session
          </button>
          {sessions.length > 5 && (
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--subtle)]" />
              <input
                type="text"
                value={sessionSearchQuery}
                onChange={(e) => setSessionSearchQuery(e.target.value)}
                placeholder="Search sessions"
                aria-label="Search sessions"
                className="field !py-1.5 !pl-8 !text-xs"
              />
            </div>
          )}
        </div>

        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {filteredSessions.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-[var(--subtle)]">
              {sessionSearchQuery ? "No sessions match that search." : "No sessions yet. Create one to start."}
            </li>
          ) : (
            filteredSessions.map((s) => {
              const isActive = activeSessionId === s.id;
              return (
                <li key={s.id} className="group relative">
                  <button
                    onClick={() => {
                      setActiveSessionId(s.id);
                      setIsSessionPaneOpen(false);
                    }}
                    aria-current={isActive ? "true" : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-[var(--radius-control)] py-2 pl-3 pr-9 text-left text-[13px] transition-colors ${
                      isActive
                        ? "bg-[var(--accent-soft)] font-medium text-[var(--accent-strong)]"
                        : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <span className="truncate">{s.title}</span>
                  </button>
                  <button
                    onClick={(e) => deleteSession(s.id, e)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[var(--subtle)] opacity-0 transition-opacity hover:bg-[var(--surface-strong)] hover:text-[var(--danger)] focus-visible:opacity-100 group-hover:opacity-100"
                    title="Delete session"
                    aria-label={`Delete session ${s.title}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Main area */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {!activeSessionId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
            <div className="max-w-md space-y-2">
              <h2 className="font-serif text-2xl font-semibold tracking-tight">Start with a session</h2>
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                A session holds the papers you upload and the conversation about them. Ask questions, and answers cite the paper they came from.
              </p>
            </div>
            <button onClick={createNewSession} className="btn btn-primary btn-lg">
              <Plus size={16} /> New session
            </button>
          </div>
        ) : (
          <>
            <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <button
                    onClick={() => setIsSessionPaneOpen((o) => !o)}
                    className="btn btn-secondary !px-2.5 !py-1.5 md:hidden"
                    aria-label="Show sessions"
                  >
                    <MessageSquare size={14} />
                  </button>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{activeTitle}</h2>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {documents.length} paper{documents.length === 1 ? "" : "s"} · {messages.length} message{messages.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex rounded-[var(--radius-control)] bg-[var(--surface-muted)] p-0.5" role="tablist" aria-label="View">
                    <button
                      role="tab"
                      aria-label="Chat"
                      aria-selected={activeView === "chat"}
                      onClick={() => setActiveView("chat")}
                      className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        activeView === "chat" ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      <MessageSquare size={13} /> <span className="hidden sm:inline">Chat</span>
                    </button>
                    <button
                      role="tab"
                      aria-label="Citation network"
                      aria-selected={activeView === "graph"}
                      onClick={() => {
                        if (documents.length > 0 && !selectedPaperForGraph) {
                          openCitationNetworkForDoc(documents[0].filename);
                        } else {
                          setActiveView("graph");
                        }
                      }}
                      title="Citation network: the papers yours cites and is cited by"
                      className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        activeView === "graph" ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      <Network size={13} /> <span className="hidden 2xl:inline">Citation network</span>
                      <span className="hidden sm:inline 2xl:hidden">Network</span>
                    </button>
                  </div>

                  {messages.length > 0 && activeView === "chat" && (
                    <button onClick={clearChatHistory} className="btn btn-quiet btn-danger hidden !px-2.5 xl:inline-flex" aria-label="Clear chat" title="Clear chat messages">
                      <Trash2 size={13} /> Clear
                    </button>
                  )}

                  <label
                    className="hidden cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-[var(--muted)] 2xl:flex"
                    title="A vision model reads each figure in new uploads (about 1 API call per figure, max 30 per paper). Figures are always extracted and searchable by caption."
                  >
                    <input
                      type="checkbox"
                      className="accent-[var(--accent)]"
                      checked={analyzeFigures}
                      onChange={(e) => {
                        setAnalyzeFiguresState(e.target.checked);
                        setAnalyzeFigures(e.target.checked);
                      }}
                    />
                    Analyze figures
                  </label>

                  <label className="btn btn-secondary hidden cursor-pointer sm:inline-flex">
                    <Upload size={14} className="text-[var(--accent)]" />
                    <span className="hidden xl:inline">Upload PDF</span>
                    <input type="file" multiple accept=".pdf" className="hidden" onChange={handleFileUpload} />
                  </label>

                  <button
                    onClick={() => setIsDocumentPaneOpen((o) => !o)}
                    className="btn btn-secondary md:hidden"
                    aria-label="Show papers"
                  >
                    <File size={14} /> {documents.length}
                  </button>
                </div>
              </div>

              {/* Upload progress */}
              {isUploading && (
                <div role="status" className="anim-pop absolute right-4 top-16 z-30 w-72 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-[var(--shadow-pop)]">
                  <div className="mb-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
                      <h3 className="text-sm font-semibold">Reading your papers</h3>
                    </div>
                    <button onClick={() => setIsUploading(false)} className="text-[var(--muted)] hover:text-[var(--foreground)]" aria-label="Hide progress">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    {uploadQueue.map((file, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between gap-3 text-xs">
                          <span className="min-w-0 truncate">{file.name}</span>
                          <span className="shrink-0 tabular-nums text-[var(--muted)]">{file.progress}%</span>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-strong)]">
                          <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${file.progress}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeView === "graph" ? (
                <div className="min-h-0 flex-1 overflow-hidden">
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
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {documents.length > 0 && (
                    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-1.5 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText size={13} className="shrink-0 text-[var(--accent)]" />
                        <span className="truncate text-[var(--muted)]">
                          Answering from <span className="font-medium text-[var(--foreground)]">{documents[0].filename}</span>
                          {documents.length > 1 && ` and ${documents.length - 1} more`}
                        </span>
                      </div>
                      <button
                        onClick={() => openCitationNetworkForDoc(documents[0].filename)}
                        className="flex shrink-0 items-center gap-1 font-medium text-[var(--accent-strong)] hover:underline"
                      >
                        <Network size={12} /> Citation network
                      </button>
                    </div>
                  )}

                  {/* Messages */}
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8">
                    {messages.length === 0 ? (
                      <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-8 py-8">
                        <div className="space-y-2">
                          <h3 className="font-serif text-2xl font-semibold tracking-tight">
                            {documents.length > 0 ? "Ask your papers a question" : "Add a paper to begin"}
                          </h3>
                          <p className="max-w-lg text-sm leading-relaxed text-[var(--muted)]">
                            {documents.length > 0
                              ? "Type a question below, or start from one of these."
                              : "Upload one or more PDFs, then ask anything about them. Answers cite the paper and page they came from."}
                          </p>
                        </div>
                        <ul className="border-t border-[var(--border)]">
                          {STARTER_PROMPTS.map((starter, i) => {
                            const IconComponent = starter.icon;
                            return (
                              <li key={i} className="border-b border-[var(--border)]">
                                <button
                                  onClick={() => handleSendMessage(starter.prompt)}
                                  disabled={isLoading}
                                  className="group flex w-full items-start gap-3.5 px-1 py-3.5 text-left transition-colors hover:bg-[var(--surface)] disabled:opacity-50"
                                >
                                  <IconComponent size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                                  <span className="min-w-0">
                                    <span className="block text-sm font-semibold group-hover:text-[var(--accent-strong)]">{starter.title}</span>
                                    <span className="mt-0.5 line-clamp-2 block text-[13px] leading-relaxed text-[var(--muted)]">{starter.prompt}</span>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : (
                      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
                        {messages.map((m, i) => {
                          const isUser = m.role === "user";
                          return (
                            <article
                              key={i}
                              className={`group flex flex-col ${isUser ? "items-end" : "items-start"}`}
                              aria-label={isUser ? "You" : "ReSector"}
                            >
                              {isUser ? (
                                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--accent)] px-4 py-2.5 text-[15px] leading-relaxed text-[var(--accent-contrast)]">
                                  {m.content}
                                </div>
                              ) : (
                                <div className="w-full">
                                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--muted)]">
                                    <span className="light-logo"><Image src="/logos/logo-light.png" alt="" width={20} height={20} /></span>
                                    <span className="dark-logo"><Image src="/logos/logo-dark.png" alt="" width={20} height={20} /></span>
                                    ReSector
                                  </div>
                                  <div className="prose break-words">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                                    <FigureCards figures={m.figures} />
                                  </div>
                                </div>
                              )}

                              <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                                <button
                                  onClick={() => copyMessageContent(m.content, i)}
                                  className="btn btn-quiet !gap-1 !px-2 !py-1 !text-xs"
                                  title="Copy message"
                                >
                                  {copiedIndex === i ? (
                                    <>
                                      <Check size={12} className="text-[var(--success)]" />
                                      <span className="text-[var(--success)]">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={12} /> Copy
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => deleteSingleMessage(i, m.id)}
                                  className="btn btn-quiet btn-danger !gap-1 !border-transparent !px-2 !py-1 !text-xs"
                                  title="Delete this message"
                                >
                                  <Trash2 size={12} /> Delete
                                </button>
                              </div>
                            </article>
                          );
                        })}

                        {isLoading && (
                          <div role="status" className="flex items-center gap-3 text-sm text-[var(--muted)]">
                            <span className="flex items-center gap-1" aria-hidden>
                              <span className="thinking-dot" />
                              <span className="thinking-dot" />
                              <span className="thinking-dot" />
                            </span>
                            Reading your papers and writing an answer…
                          </div>
                        )}
                      </div>
                    )}
                    <div ref={scrollRef} />
                  </div>

                  {/* Composer */}
                  <div className="shrink-0 bg-[var(--background)] px-4 pb-4 pt-2 sm:px-8">
                    <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] transition-colors focus-within:border-[var(--accent)]">
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
                        placeholder="Ask about your papers: findings, methods, limitations…"
                        aria-label="Message"
                        rows={1}
                        className="block max-h-[200px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-relaxed text-[var(--foreground)] placeholder:text-[var(--subtle)] focus:!outline-none"
                      />
                      <div className="flex items-center justify-between px-2.5 pb-2.5">
                        <label className="btn btn-quiet cursor-pointer !px-2.5 !py-1.5 !text-xs" title="Attach PDFs">
                          <Paperclip size={14} /> Attach PDF
                          <input type="file" multiple accept=".pdf" className="hidden" onChange={handleFileUpload} />
                        </label>
                        <div className="flex items-center gap-3">
                          <span className="hidden text-xs text-[var(--subtle)] sm:inline">Enter to send · Shift+Enter for a new line</span>
                          <button
                            onClick={() => handleSendMessage()}
                            disabled={isLoading || !input.trim()}
                            aria-label="Send message"
                            className="btn btn-primary !rounded-full !px-3.5"
                          >
                            {isLoading ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                            <span>{isLoading ? "Thinking" : "Send"}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Papers */}
            <aside
              aria-label="Papers" style={panelStyle(papersPanel.width)}
              className={`${isDocumentPaneOpen ? "max-md:flex" : "max-md:hidden"} flex w-64 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)] md:relative md:w-[var(--panel-w)] max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:w-72 max-md:shadow-[var(--shadow-pop)]`}
            >
              <ResizeHandle panel={papersPanel} edge="left" label="Resize the papers panel" />
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="text-sm font-semibold">Papers <span className="font-normal text-[var(--muted)]">({documents.length})</span></h3>
                <button onClick={() => setIsDocumentPaneOpen(false)} className="icon-btn !h-8 !w-8 md:hidden" aria-label="Close papers">
                  <X size={15} />
                </button>
              </div>

              <ul className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--border)]">
                {documents.length === 0 ? (
                  <li className="space-y-3 px-4 py-10 text-center">
                    <BookOpen size={22} className="mx-auto text-[var(--subtle)]" />
                    <p className="text-xs text-[var(--muted)]">No papers in this session yet.</p>
                    <label className="btn btn-secondary cursor-pointer !text-xs">
                      Upload PDF
                      <input type="file" multiple accept=".pdf" className="hidden" onChange={handleFileUpload} />
                    </label>
                  </li>
                ) : (
                  documents.map((doc) => (
                    <li key={doc.id} className="group border-b border-[var(--border)] px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <File size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                          <span className="line-clamp-3 text-[13px] font-medium leading-snug" title={doc.filename}>
                            {doc.filename}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteDocument(doc.id)}
                          className="shrink-0 rounded-md p-1 text-[var(--subtle)] opacity-0 transition-opacity hover:bg-[var(--surface-muted)] hover:text-[var(--danger)] focus-visible:opacity-100 group-hover:opacity-100"
                          title="Remove paper"
                          aria-label={`Remove ${doc.filename}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <button
                        onClick={() => openCitationNetworkForDoc(doc.filename)}
                        className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[var(--accent-strong)] hover:underline"
                        title="Explore the papers this one cites and is cited by"
                      >
                        <Network size={12} /> Citation network
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
