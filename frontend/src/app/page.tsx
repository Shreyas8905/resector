"use client";

import React, { useEffect, useState } from "react";
import {
  Archive,
  FileSearch,
  FlaskConical,
  LayoutDashboard,
  Lightbulb,
  MessageSquare,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import Image from "next/image";
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
import UpdateStatus from "@/components/UpdateStatus";

type Tool =
  | "sifter"
  | "critique"
  | "jargon"
  | "history"
  | "paperchat"
  | "graph"
  | "dashboards";

type ToolDef = { id: Tool; label: string; blurb: string; icon: React.ReactNode };

const tools: ToolDef[] = [
  { id: "paperchat", label: "Chat with your papers", blurb: "Upload PDFs and ask questions. Answers cite the paper and show the relevant figure.", icon: <MessageSquare size={18} /> },
  { id: "dashboards", label: "Research dashboards", blurb: "A canvas per project: lay out papers, save passages and link the ideas that connect.", icon: <LayoutDashboard size={18} /> },
  { id: "graph", label: "Find related papers", blurb: "Pick a paper and see the papers it cites and the ones that cite it.", icon: <Network size={18} /> },
  { id: "sifter", label: "Summarize a paper", blurb: "Get the research question, method and weak points from text or a PDF.", icon: <FileSearch size={18} /> },
  { id: "critique", label: "Review my writing", blurb: "A tough but fair peer-review of your idea or draft.", icon: <FlaskConical size={18} /> },
  { id: "jargon", label: "Explain in plain language", blurb: "Turn dense academic text into simple words.", icon: <Lightbulb size={18} /> },
  { id: "history", label: "Past results", blurb: "Search everything you have run before.", icon: <Archive size={18} /> },
];

// Sidebar groups: working surfaces first, then one-shot tools, then the archive.
const NAV_GROUPS: Tool[][] = [
  ["paperchat", "dashboards", "graph"],
  ["sifter", "critique", "jargon"],
  ["history"],
];

const byId = (id: Tool) => tools.find((t) => t.id === id)!;
const FULL_BLEED: Tool[] = ["paperchat", "graph", "dashboards"];

function GitHubLink({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="https://github.com/Shreyas8905/resector"
      target="_blank"
      rel="noopener noreferrer"
      title="Star ReSector on GitHub"
      className={`inline-flex items-center gap-2 text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)] ${compact ? "justify-center" : ""}`}
    >
      <svg className="h-4 w-4 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
      {!compact && <span>Enjoying ReSector? Star it on GitHub</span>}
    </a>
  );
}

function Logo({ size }: { size: number }) {
  return (
    <>
      <span className="light-logo shrink-0">
        <Image src="/logos/logo-light.png" alt="ReSector" width={size} height={size} priority />
      </span>
      <span className="dark-logo shrink-0">
        <Image src="/logos/logo-dark.png" alt="ReSector" width={size} height={size} priority />
      </span>
    </>
  );
}

export default function Page() {
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [ready, setReady] = useState(false);

  // Desktop starts with the sidebar open; phones start closed. `ready` keeps the first paint from animating.
  useEffect(() => {
    setIsSidebarOpen(window.matchMedia("(min-width: 768px)").matches);
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const selectTool = (tool: Tool | null) => {
    setActiveTool(tool);
    // On a phone the sidebar covers the screen, so close it after choosing; on desktop it stays put.
    if (!window.matchMedia("(min-width: 768px)").matches) setIsSidebarOpen(false);
  };

  const current = activeTool ? byId(activeTool) : null;
  const fullBleed = activeTool !== null && FULL_BLEED.includes(activeTool);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* Scrim for the phone-sized overlay sidebar */}
      {isSidebarOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setIsSidebarOpen(false)}
          className="anim-fade fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        aria-label="Navigation"
        className={`z-40 flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:w-64 ${
          ready ? "transition-[width,transform] duration-200 ease-out" : ""
        } ${isSidebarOpen ? "w-64 max-md:translate-x-0" : "w-[68px] max-md:-translate-x-full"}`}
      >
        <button
          onClick={() => selectTool(null)}
          title="Home"
          className={`flex items-center gap-3 border-b border-[var(--border)] text-left ${isSidebarOpen ? "h-16 px-4" : "h-16 justify-center"}`}
        >
          <Logo size={isSidebarOpen ? 38 : 34} />
          {isSidebarOpen && (
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold leading-tight tracking-tight">ReSector</span>
              <span className="block truncate text-xs text-[var(--muted)]">Research workspace</span>
            </span>
          )}
        </button>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="Research tools">
          {NAV_GROUPS.map((group, gi) => (
            <ul key={gi} className={`space-y-0.5 ${gi > 0 ? "mt-3 border-t border-[var(--border)] pt-3" : ""}`}>
              {group.map((id) => {
                const tool = byId(id);
                const active = activeTool === id;
                return (
                  <li key={id}>
                    <button
                      onClick={() => selectTool(id)}
                      title={tool.label}
                      aria-label={isSidebarOpen ? undefined : tool.label}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex w-full items-center gap-3 rounded-[var(--radius-control)] py-2 text-left text-[13.5px] transition-colors ${
                        isSidebarOpen ? "px-3" : "justify-center px-0"
                      } ${
                        active
                          ? "bg-[var(--accent-soft)] font-medium text-[var(--accent-strong)]"
                          : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-[var(--accent)]" aria-hidden />}
                      <span className="shrink-0">{tool.icon}</span>
                      {isSidebarOpen && <span className="truncate">{tool.label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}
        </nav>

        <div className="border-t border-[var(--border)]">
          <UpdateStatus compact={!isSidebarOpen} />
          <div className={`py-3 ${isSidebarOpen ? "px-4" : "flex justify-center"}`}>
            <GitHubLink compact={!isSidebarOpen} />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setIsSidebarOpen((o) => !o)}
              aria-label={isSidebarOpen ? "Collapse navigation" : "Open navigation"}
              title={isSidebarOpen ? "Collapse navigation" : "Open navigation"}
              className="icon-btn"
            >
              {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold leading-tight">{current ? current.label : "Home"}</h1>
              {current && <p className="hidden truncate text-xs text-[var(--muted)] lg:block">{current.blurb}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <SettingsDrawer />
          </div>
        </header>

        <main className={`min-h-0 flex-1 ${fullBleed ? "overflow-hidden" : "overflow-y-auto"}`}>
          {!activeTool ? (
            <Home onPick={selectTool} />
          ) : (
            <div className={`w-full ${fullBleed ? "h-full" : "mx-auto max-w-4xl px-5 py-8 sm:px-10 sm:py-10"}`}>
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

function Home({ onPick }: { onPick: (t: Tool) => void }) {
  const lead = byId("paperchat");
  const rest = tools.filter((t) => t.id !== "paperchat");
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-10 sm:py-14">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:gap-8">
        <Logo size={120} />
        <div>
          <h2 className="font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-[2.15rem]">
            What would you like to do?
          </h2>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[var(--muted)]">
            Read, question and connect your papers in one place. Everything stays on this computer.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <SetupBanner />
      </div>

      <button
        onClick={() => onPick(lead.id)}
        className="group mt-8 flex w-full items-center gap-4 rounded-[var(--radius-panel)] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-5 text-left transition-colors hover:border-[var(--accent)]"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]">
          {lead.icon}
        </span>
        <span className="min-w-0">
          <span className="block text-base font-semibold">{lead.label}</span>
          <span className="mt-0.5 block text-sm text-[var(--muted)]">{lead.blurb}</span>
        </span>
      </button>

      <ul className="mt-6 grid gap-x-8 sm:grid-cols-2">
        {rest.map((tool) => (
          <li key={tool.id} className="border-t border-[var(--border)]">
            <button
              onClick={() => onPick(tool.id)}
              className="group -mx-2 flex w-[calc(100%+1rem)] items-start gap-3.5 rounded-[var(--radius-control)] px-2 py-4 text-left transition-colors hover:bg-[var(--surface)]"
            >
              <span className="mt-0.5 shrink-0 text-[var(--accent)]">{tool.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold group-hover:text-[var(--accent-strong)]">{tool.label}</span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-[var(--muted)]">{tool.blurb}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
