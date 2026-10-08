"use client";

import React, { useState } from "react";
import {
  Archive,
  FileSearch,
  FlaskConical,
  Lightbulb,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import SettingsDrawer from "@/components/SettingsDrawer";
import SifterTool from "@/components/SifterTool";
import CritiqueTool from "@/components/CritiqueTool";
import JargonTool from "@/components/JargonTool";
import ResearchHistory from "@/components/ResearchHistory";
import PaperChatPage from "@/app/paper-chat/page";
import PaperGraphView from "@/components/PaperGraphView";
import ThemeToggle from "@/components/ThemeToggle";
import { Network } from "lucide-react";

type Tool = "sifter" | "critique" | "jargon" | "history" | "paperchat" | "graph";

const tools: { id: Tool; label: string; icon: React.ReactNode }[] = [
  { id: "paperchat", label: "Paper Chat", icon: <MessageSquare size={17} /> },
  { id: "graph", label: "Citation Graph", icon: <Network size={17} /> },
  { id: "sifter", label: "Sift Research", icon: <FileSearch size={17} /> },
  { id: "critique", label: "Stress Test", icon: <FlaskConical size={17} /> },
  { id: "jargon", label: "Simplify Text", icon: <Lightbulb size={17} /> },
  { id: "history", label: "Research Archive", icon: <Archive size={17} /> },
];


export default function Page() {
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const selectTool = (tool: Tool | null) => {
    setActiveTool(tool);
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <aside
        className={`${isSidebarOpen ? "w-64" : "w-0"} shrink-0 overflow-hidden border-r border-[var(--border)] bg-[var(--surface)] transition-[width] duration-200 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 ${isSidebarOpen ? "max-md:w-64" : "max-md:w-0"}`}
      >
        <div className="flex h-full w-64 flex-col p-4">
          <button
            onClick={() => selectTool(null)}
            className="mb-8 flex items-center gap-3 px-2 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)]">
              <FlaskConical size={18} />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-wide">
                Resector
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Research workspace
              </span>
            </span>
          </button>

          <nav className="space-y-1" aria-label="Research tools">
            <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--subtle)]">
              Workspace
            </p>
            {tools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => selectTool(tool.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${activeTool === tool.id ? "bg-[var(--surface-strong)] font-medium text-[var(--foreground)]" : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"}`}
              >
                {tool.icon}
                {tool.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto border-t border-[var(--border)] px-3 pt-4 text-xs text-[var(--subtle)]">
            Local research tools
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen((isOpen) => !isOpen)}
              aria-label={
                isSidebarOpen ? "Collapse navigation" : "Open navigation"
              }
              title={isSidebarOpen ? "Collapse navigation" : "Open navigation"}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
            >
              {isSidebarOpen ? (
                <PanelLeftClose size={18} />
              ) : (
                <PanelLeftOpen size={18} />
              )}
            </button>
            <div className="text-sm font-medium">
              {activeTool
                ? tools.find((tool) => tool.id === activeTool)?.label
                : "Workspace"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SettingsDrawer />
          </div>
        </header>

        <main
          className={`min-h-0 flex-1 ${activeTool === "paperchat" || activeTool === "graph" ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          {!activeTool ? (
            <div className="mx-auto flex min-h-full w-full max-w-5xl items-center px-6 py-12 sm:px-10">
              <div className="w-full">
                <div className="mb-10 max-w-xl">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                    Research workspace
                  </p>
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Choose a tool to begin.
                  </h1>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {tools.map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => selectTool(tool.id)}
                      className="group flex min-h-32 flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left shadow-[var(--shadow)] transition-colors hover:border-[var(--accent)]"
                    >
                      <span className="text-[var(--accent)]">{tool.icon}</span>
                      <span className="text-sm font-medium group-hover:text-[var(--accent-strong)]">
                        {tool.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div
              className={`mx-auto w-full ${activeTool === "paperchat" || activeTool === "graph" ? "h-full max-w-none px-0 py-0" : "max-w-5xl px-6 py-8 sm:px-10"}`}
            >
              {activeTool === "graph" && <PaperGraphView />}
              {activeTool === "sifter" && <SifterTool />}
              {activeTool === "critique" && <CritiqueTool />}
              {activeTool === "jargon" && <JargonTool />}
              {activeTool === "history" && <ResearchHistory />}
              {activeTool === "paperchat" && <PaperChatPage />}
            </div>
          )}
        </main>

      </div>
    </div>
  );
}
