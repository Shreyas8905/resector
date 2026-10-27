"use client";

import React, { useState } from "react";
import {
  Archive,
  FileSearch,
  FlaskConical,
  LayoutDashboard,
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
import DashboardsTool from "@/components/dashboard/DashboardsTool";
import PaperGraphView from "@/components/PaperGraphView";
import ThemeToggle from "@/components/ThemeToggle";
import SetupBanner from "@/components/SetupBanner";
import { Network } from "lucide-react";
import Image from "next/image";

type Tool =
  | "sifter"
  | "critique"
  | "jargon"
  | "history"
  | "paperchat"
  | "graph"
  | "dashboards";

const tools: { id: Tool; label: string; blurb: string; icon: React.ReactNode }[] = [
  { id: "paperchat", label: "Chat with your papers", blurb: "Upload PDFs and ask questions. Answers cite the paper and show the relevant figure.", icon: <MessageSquare size={17} /> },
  { id: "dashboards", label: "Research dashboards", blurb: "A canvas per project: lay out papers, save passages and link the ideas that connect.", icon: <LayoutDashboard size={17} /> },
  { id: "graph", label: "Find related papers", blurb: "Pick a paper and see the papers it cites and the ones that cite it.", icon: <Network size={17} /> },
  { id: "sifter", label: "Summarize a paper", blurb: "Get the research question, method and weak points from text or a PDF.", icon: <FileSearch size={17} /> },
  { id: "critique", label: "Review my writing", blurb: "A tough but fair peer-review of your idea or draft.", icon: <FlaskConical size={17} /> },
  { id: "jargon", label: "Explain in plain language", blurb: "Turn dense academic text into simple words.", icon: <Lightbulb size={17} /> },
  { id: "history", label: "Past results", blurb: "Search everything you have run before.", icon: <Archive size={17} /> },
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
            <span className="light-logo">
              <Image
                src="/logos/logo-light.png"
                alt="Resector"
                width={60}
                height={60}
                priority
              />
            </span>

            <span className="dark-logo">
              <Image
                src="/logos/logo-dark.png"
                alt="Resector"
                width={60}
                height={60}
                priority
              />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-wide">
                ReSector
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
          {!activeTool ? (
            <div></div>
          ) : (
            <footer className="mt-auto py-1 text-center text-xs text-[var(--muted)] border-t border-[var(--border)] flex items-center justify-center gap-2">
              <span>Enjoying Resector?</span>
              <a
                href="https://github.com/Shreyas8905/resector"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-[var(--foreground)] hover:text-[var(--accent)] transition-colors"
              >
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                <span>Star on GitHub</span>
              </a>
            </footer>
          )}
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
          className={`min-h-0 flex-1 ${activeTool === "paperchat" || activeTool === "graph" || activeTool === "dashboards" ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          {!activeTool ? (
            <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-between px-0.5 py-0.1 sm:px-10">
              <div className="w-full flex flex-col items-center justify-center text-center my-auto">
                <span className="light-logo">
                  <Image
                    src="/logos/logo-light.png"
                    alt="ReSector"
                    width={200}
                    height={200}
                    priority
                  />
                </span>

                <span className="dark-logo">
                  <Image
                    src="/logos/logo-dark.png"
                    alt="ReSector"
                    width={200}
                    height={200}
                    priority
                  />
                </span>
                <div className="mb-10 max-w-xl mx-auto">
                  <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-[var(--accent)]">
                    ReSector
                  </p>
                  <p className="text-2xl font-semibold tracking-tight sm:text-1xl">
                    What would you like to do?
                  </p>
                </div>
                <SetupBanner />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 w-full">
                  {tools.map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => selectTool(tool.id)}
                      className="group flex min-h-28 flex-col justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left shadow-[var(--shadow)] transition-colors hover:border-[var(--accent)]"
                    >
                      <span className="text-[var(--accent)]">{tool.icon}</span>
                      <span>
                        <span className="block text-sm font-medium group-hover:text-[var(--accent-strong)]">
                          {tool.label}
                        </span>
                        <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
                          {tool.blurb}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* GitHub Star Footer */}
              <footer className="mt-auto py-2 text-center text-xs text-[var(--muted)] border-t border-[var(--border)] flex items-center justify-center gap-2">
                <span>Enjoying Resector?</span>
                <a
                  href="https://github.com/Shreyas8905/resector"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-[var(--foreground)] hover:text-[var(--accent)] transition-colors"
                >
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  <span>Star on GitHub</span>
                </a>
              </footer>
            </div>
          ) : (
            <div
              className={`mx-auto w-full ${activeTool === "paperchat" || activeTool === "graph" || activeTool === "dashboards" ? "h-full max-w-none px-0 py-0" : "max-w-5xl px-6 py-8 sm:px-10"}`}
            >
              {activeTool === "graph" && <PaperGraphView />}
              {activeTool === "dashboards" && <DashboardsTool />}
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
