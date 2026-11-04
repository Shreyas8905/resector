"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  FileSearch,
  FlaskConical,
  LayoutDashboard,
  Lightbulb,
  Home as Home2,
  Sparkles,
  MessageSquare,
  Network,
  Search,
  Settings,
  Moon,
  Sun,
  Monitor,
  Type,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Bell,
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
import AppearanceMenu from "@/components/AppearanceMenu";
import CommandPalette, { type PaletteItem } from "@/components/CommandPalette";
import SetupBanner from "@/components/SetupBanner";
import UpdateStatus from "@/components/UpdateStatus";
import { openSettings } from "@/lib/errors";
import { dashboardApi, type DashboardSummary } from "@/lib/dashboardApi";
import { useAppearance } from "@/lib/appearance";

type Tool =
  | "sifter"
  | "critique"
  | "jargon"
  | "history"
  | "paperchat"
  | "graph"
  | "dashboards";

type ToolDef = {
  id: Tool;
  label: string;
  blurb: string;
  icon: React.ReactNode;
  color: string;
};

const tools: ToolDef[] = [
  {
    id: "paperchat",
    label: "Chat with your papers",
    blurb:
      "Upload PDFs and ask questions. Answers cite the paper and show the relevant figure.",
    icon: <MessageSquare size={18} />,
    color: "var(--tool-chat)",
  },
  {
    id: "dashboards",
    label: "Research dashboards",
    blurb:
      "A canvas per project: lay out papers, save passages, link ideas and write with sources.",
    icon: <LayoutDashboard size={18} />,
    color: "var(--tool-dashboards)",
  },
  {
    id: "graph",
    label: "Find related papers",
    blurb:
      "Pick a paper and see the papers it cites and the ones that cite it.",
    icon: <Network size={18} />,
    color: "var(--tool-graph)",
  },
  {
    id: "sifter",
    label: "Summarize a paper",
    blurb:
      "Get the research question, method and weak points from text or a PDF.",
    icon: <FileSearch size={18} />,
    color: "var(--tool-sifter)",
  },
  {
    id: "critique",
    label: "Review my writing",
    blurb: "A tough but fair peer-review of your idea or draft.",
    icon: <FlaskConical size={18} />,
    color: "var(--tool-critique)",
  },
  {
    id: "jargon",
    label: "Explain in plain language",
    blurb: "Turn dense academic text into simple words.",
    icon: <Lightbulb size={18} />,
    color: "var(--tool-jargon)",
  },
  {
    id: "history",
    label: "Past results",
    blurb: "Search everything you have run before.",
    icon: <Archive size={18} />,
    color: "var(--tool-history)",
  },
];

// Sidebar groups: working surfaces first, then one-shot tools, then the archive.
// The rail shows only the four places people live in; the one-shot helpers sit behind "Helpers".
const RAIL: { id: Tool; label: string }[] = [
  { id: "dashboards", label: "Dashboards" },
  { id: "paperchat", label: "Chat" },
  { id: "graph", label: "Related" },
];
const HELPERS: Tool[] = ["sifter", "critique", "jargon", "history"];

const byId = (id: Tool) => tools.find((t) => t.id === id)!;
const FULL_BLEED: Tool[] = ["paperchat", "graph", "dashboards"];
const toneOf = (color: string) => ({ "--t": color }) as React.CSSProperties;

function GitHubLink({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="https://github.com/Shreyas8905/resector"
      target="_blank"
      rel="noopener noreferrer"
      title="Star ReSector on GitHub"
      className={`inline-flex items-center gap-2 text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)] ${compact ? "justify-center" : ""}`}
    >
      <svg
        className="h-4 w-4 shrink-0 fill-current"
        viewBox="0 0 24 24"
        aria-hidden
      >
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
        <Image
          src="/logos/logo-light.png"
          alt="ReSector"
          width={size}
          height={size}
          priority
        />
      </span>
      <span className="dark-logo shrink-0">
        <Image
          src="/logos/logo-dark.png"
          alt="ReSector"
          width={size}
          height={size}
          priority
        />
      </span>
    </>
  );
}

/** "ReSector" spelled out, in the brand colours of the current theme (they change with light/dark). */
function Wordmark({ size = "md" }: { size?: "sm" | "md" | "xl" }) {
  const cls =
    size === "xl" ? "text-5xl" : size === "md" ? "text-xl" : "text-[0.9375rem]";
  return (
    <span
      className={`app-rail-wordmark font-serif font-semibold tracking-tight ${cls}`}
      aria-label="ReSector"
    >
      <span className="text-[var(--foreground)]">Re</span>
      <span className="text-[var(--accent)]">Sector</span>
    </span>
  );
}

/** One click between light and dark. (The Look menu still offers Auto and text size.) */
function ThemeQuick() {
  const { setTheme } = useAppearance();
  return (
    <button
      onClick={() =>
        setTheme(
          document.documentElement.dataset.theme === "dark" ? "light" : "dark",
        )
      }
      title="Switch light and dark theme"
      aria-label="Switch light and dark theme"
      className="dashboard-theme-toggle flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
    >
      <span className="theme-icon-light">
        <Moon size={18} />
      </span>
      <span className="theme-icon-dark">
        <Sun size={18} />
      </span>
      <span className="hidden lg:inline">Theme</span>
    </button>
  );
}

export default function Page() {
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(true);
  const [headerSearch, setHeaderSearch] = useState("");
  const railHydrated = useRef(false);
  const { setTheme, setText } = useAppearance();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("resector_rail");
        if (saved === "collapsed") setRailExpanded(false);
        railHydrated.current = true;
      } catch {
        // Keep the expanded default when storage is unavailable.
        railHydrated.current = true;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!railHydrated.current) return;
    try {
      localStorage.setItem(
        "resector_rail",
        railExpanded ? "expanded" : "collapsed",
      );
    } catch {
      // The control still works for the current session.
    }
  }, [railExpanded]);

  const selectTool = (tool: Tool | null) => {
    setActiveTool(tool);
  };

  const fullBleed = activeTool !== null && FULL_BLEED.includes(activeTool);

  const paletteItems: PaletteItem[] = useMemo(
    () => [
      {
        id: "home",
        label: "Home",
        hint: "What would you like to do?",
        group: "Go to",
        icon: (
          <span className="tool-chip h-8 w-8" style={toneOf("var(--accent)")}>
            <Search size={16} />
          </span>
        ),
        run: () => selectTool(null),
      },
      ...tools.map((t) => ({
        id: t.id,
        label: t.label,
        hint: t.blurb,
        group: "Go to",
        icon: (
          <span className="tool-chip h-8 w-8" style={toneOf(t.color)}>
            {t.icon}
          </span>
        ),
        run: () => selectTool(t.id),
      })),
      {
        id: "set",
        label: "AI settings",
        hint: "Choose your AI service and paste your key",
        group: "Settings",
        keywords: "api key provider tavily model",
        icon: (
          <span className="tool-chip h-8 w-8">
            <Settings size={16} />
          </span>
        ),
        run: () => openSettings(),
      },
      {
        id: "th-l",
        label: "Light theme",
        group: "Appearance",
        icon: (
          <span className="tool-chip h-8 w-8">
            <Sun size={16} />
          </span>
        ),
        run: () => setTheme("light"),
      },
      {
        id: "th-d",
        label: "Dark theme",
        group: "Appearance",
        icon: (
          <span className="tool-chip h-8 w-8">
            <Moon size={16} />
          </span>
        ),
        run: () => setTheme("dark"),
      },
      {
        id: "th-s",
        label: "Follow my computer's theme",
        group: "Appearance",
        icon: (
          <span className="tool-chip h-8 w-8">
            <Monitor size={16} />
          </span>
        ),
        run: () => setTheme("system"),
      },
      {
        id: "tx-n",
        label: "Normal text size",
        group: "Appearance",
        keywords: "font bigger smaller",
        icon: (
          <span className="tool-chip h-8 w-8">
            <Type size={16} />
          </span>
        ),
        run: () => setText("normal"),
      },
      {
        id: "tx-l",
        label: "Large text",
        group: "Appearance",
        keywords: "font bigger",
        icon: (
          <span className="tool-chip h-8 w-8">
            <Type size={16} />
          </span>
        ),
        run: () => setText("large"),
      },
      {
        id: "tx-x",
        label: "Extra large text",
        group: "Appearance",
        keywords: "font bigger",
        icon: (
          <span className="tool-chip h-8 w-8">
            <Type size={16} />
          </span>
        ),
        run: () => setText("xlarge"),
      },
    ],
    [setTheme, setText],
  );

  return (
    <div className="dashboard-frame flex h-screen flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <header className="dashboard-topbar flex h-16 shrink-0 items-center gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-4 sm:px-6">
        <button
          onClick={() => setRailExpanded((expanded) => !expanded)}
          className="dashboard-menu-button icon-btn shrink-0"
          title={railExpanded ? "Collapse navigation" : "Expand navigation"}
          aria-label={
            railExpanded ? "Collapse navigation" : "Expand navigation"
          }
        >
          <Menu size={21} />
        </button>
        <button
          onClick={() => selectTool(null)}
          title="ReSector home"
          aria-label="ReSector home"
          className="dashboard-brand flex shrink-0 items-center gap-2"
        >
          <Logo size={34} />
          <Wordmark size="md" />
        </button>
        <div className="dashboard-search mx-auto flex min-w-0 max-w-2xl flex-1 items-center">
          <input
            value={headerSearch}
            onChange={(e) => setHeaderSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setPaletteOpen(true);
            }}
            placeholder="Search ReSector"
            aria-label="Search ReSector"
            className="dashboard-search-input min-w-0 flex-1"
          />
          <button
            onClick={() => setPaletteOpen(true)}
            className="dashboard-search-button icon-btn"
            title="Search or jump to anything"
            aria-label="Search or jump to anything"
          >
            <Search size={20} />
          </button>
        </div>
        <div className="dashboard-actions flex shrink-0 items-center gap-1.5">
          <ThemeQuick />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Navigation"
          className={`app-rail z-40 flex shrink-0 flex-col items-center border-r border-[var(--border)] bg-[var(--surface)] px-2 py-3 ${railExpanded ? "app-rail-expanded w-52" : "app-rail-collapsed w-[4.5rem]"}`}
        >
          <nav className="flex w-full flex-1 flex-col gap-1" aria-label="Main">
            <RailButton
              label="Home"
              active={activeTool === null}
              onClick={() => selectTool(null)}
              color="var(--accent)"
              icon={<Home2 size={22} />}
            />
            {RAIL.map(({ id, label }) => {
              const t = byId(id);
              return (
                <RailButton
                  key={id}
                  label={label}
                  title={t.label}
                  active={activeTool === id}
                  onClick={() => selectTool(id)}
                  color={t.color}
                  icon={React.cloneElement(
                    t.icon as React.ReactElement<{ size?: number }>,
                    { size: 22 },
                  )}
                />
              );
            })}
            <HelpersMenu active={activeTool} onPick={selectTool} />
            <RailButton
              label="Search"
              title="Search or jump to anything (Ctrl+K)"
              active={false}
              onClick={() => setPaletteOpen(true)}
              color="var(--accent)"
              icon={<Search size={22} />}
            />
          </nav>

          <div className="flex w-full flex-col gap-1 border-t border-[var(--border)] px-2 pt-2">
            <button
              onClick={() => setRailExpanded((expanded) => !expanded)}
              className="nav-rail-button flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-[0.6875rem] font-medium leading-tight text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
              title={railExpanded ? "Collapse navigation" : "Expand navigation"}
              aria-label={
                railExpanded ? "Collapse navigation" : "Expand navigation"
              }
            >
              {railExpanded ? (
                <PanelLeftClose size={18} />
              ) : (
                <PanelLeftOpen size={18} />
              )}
              {railExpanded && <span>Collapse</span>}
            </button>
            <SettingsDrawer stacked />
            <AppearanceMenu stacked />
            <UpdateStatus compact />
          </div>
        </aside>

        <main
          className={`min-h-0 min-w-0 flex-1 ${fullBleed ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          <div key={activeTool ?? "home"} className="anim-page h-full">
            {!activeTool ? (
              <Home
                onPick={selectTool}
                onOpenDashboards={() => selectTool("dashboards")}
              />
            ) : (
              <div
                className={`w-full ${fullBleed ? "h-full" : "mx-auto max-w-3xl px-6 py-10 sm:px-12 sm:py-14"}`}
              >
                {activeTool === "graph" && (
                  <div className="flex h-full min-h-0 flex-col">
                    <ToolTitle tool={byId("graph")} />
                    <div className="min-h-0 flex-1">
                      <PaperGraphView />
                    </div>
                  </div>
                )}
                {activeTool === "dashboards" && <DashboardsTool />}
                {activeTool === "sifter" && <SifterTool />}
                {activeTool === "critique" && <CritiqueTool />}
                {activeTool === "jargon" && <JargonTool />}
                {activeTool === "history" && (
                  <>
                    <ToolTitle tool={byId("history")} padded />
                    <ResearchHistory />
                  </>
                )}
                {activeTool === "paperchat" && <PaperChatPage />}
              </div>
            )}
          </div>
        </main>
      </div>

      <CommandPalette
        items={paletteItems}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}

function RailButton({
  label,
  title,
  icon,
  color,
  active,
  onClick,
}: {
  label: string;
  title?: string;
  icon: React.ReactNode;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      aria-current={active ? "page" : undefined}
      style={toneOf(color)}
      className={`nav-rail-button flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left text-[0.8125rem] font-medium leading-tight transition-colors ${active ? "bg-[color-mix(in_srgb,var(--t)_14%,transparent)] text-[var(--t)]" : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"}`}
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

/** The four one-shot helpers, in a menu that opens beside the rail with a plain sentence for each. */
function HelpersMenu({
  active,
  onPick,
}: {
  active: Tool | null;
  onPick: (t: Tool) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = React.useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const target = e.target as Node;
      if (box.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-helpers-menu]"))
        return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const isHelper = active !== null && HELPERS.includes(active);
  const toggle = () => {
    if (!open && box.current) {
      const rect = box.current.getBoundingClientRect();
      const menuWidth = 320;
      const gap = 12;
      setMenuPosition({
        left: Math.min(rect.right + gap, window.innerWidth - menuWidth - 12),
        top: Math.min(rect.top, window.innerHeight - 440),
      });
    }
    setOpen((o) => !o);
  };
  return (
    <div ref={box} className="relative">
      <RailButton
        label="Helpers"
        title="Summarize, review, explain, past results"
        active={isHelper || open}
        onClick={toggle}
        color="var(--tool-sifter)"
        icon={<Sparkles size={22} />}
      />
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="menu"
            data-helpers-menu
            className="float anim-pop fixed z-[100] w-80 p-2"
            style={menuPosition}
          >
            <p className="px-3 pb-1 pt-2 text-sm font-semibold">
              Quick helpers
            </p>
            {HELPERS.map((id) => {
              const t = byId(id);
              return (
                <button
                  key={id}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onPick(id);
                  }}
                  style={toneOf(t.color)}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-[var(--surface-muted)]"
                >
                  <span className="tool-chip mt-0.5 h-9 w-9 shrink-0">
                    {t.icon}
                  </span>
                  <span>
                    <span className="block text-[0.9375rem] font-semibold">
                      {t.label}
                    </span>
                    <span className="block text-sm leading-snug text-[var(--muted)]">
                      {t.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Heading for tools that have no title of their own now that the global top bar is gone. */
function ToolTitle({
  tool,
  padded = false,
}: {
  tool: ToolDef;
  padded?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 border-b border-[var(--border)] ${padded ? "mb-6 pb-4" : "px-4 py-3"}`}
      style={toneOf(tool.color)}
    >
      <span className="tool-chip h-9 w-9">{tool.icon}</span>
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold leading-tight">
          {tool.label}
        </h1>
        <p className="truncate text-sm text-[var(--muted)]">{tool.blurb}</p>
      </div>
    </div>
  );
}

function Home({
  onPick,
  onOpenDashboards,
}: {
  onPick: (t: Tool) => void;
  onOpenDashboards: () => void;
}) {
  const [recent, setRecent] = useState<DashboardSummary[] | null>(null);
  useEffect(() => {
    dashboardApi
      .list()
      .then((l) => setRecent(l.slice(0, 3)))
      .catch(() => setRecent([]));
  }, []);
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const starts: Tool[] = ["dashboards", "paperchat", "graph"];
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-14 sm:px-12 sm:py-20">
      <div className="mb-12 flex items-center gap-4">
        <Logo size={56} />
        <div>
          <Wordmark size="xl" />
          <p className="text-sm text-[var(--muted)]">Your research workspace</p>
        </div>
      </div>
      <h2 className="font-serif text-4xl font-semibold leading-tight tracking-tight">
        {greeting}.
      </h2>
      <p className="mt-3 max-w-lg text-lg leading-relaxed text-[var(--muted)]">
        What would you like to do today? Everything stays on this computer.
      </p>

      <div className="mt-10">
        <SetupBanner />
      </div>

      <section className="mt-12" aria-labelledby="start-h">
        <h3
          id="start-h"
          className="mb-4 text-sm font-semibold text-[var(--muted)]"
        >
          Start here
        </h3>
        <ul className="grid gap-5 sm:grid-cols-3">
          {starts.map((id) => {
            const t = byId(id);
            return (
              <li key={id}>
                <button
                  onClick={() => onPick(id)}
                  style={toneOf(t.color)}
                  className="card flex h-full w-full flex-col items-start gap-4 p-6 text-left"
                >
                  <span className="tool-chip h-12 w-12 !rounded-xl">
                    {React.cloneElement(
                      t.icon as React.ReactElement<{ size?: number }>,
                      { size: 24 },
                    )}
                  </span>
                  <span>
                    <span className="block text-lg font-semibold leading-snug">
                      {t.label}
                    </span>
                    <span className="mt-1.5 block text-[0.9375rem] leading-relaxed text-[var(--muted)]">
                      {t.blurb}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-14" aria-labelledby="recent-h">
        <div className="mb-4 flex items-baseline justify-between">
          <h3
            id="recent-h"
            className="text-sm font-semibold text-[var(--muted)]"
          >
            Pick up where you left off
          </h3>
          {recent && recent.length > 0 && (
            <button
              onClick={onOpenDashboards}
              className="text-sm font-medium text-[var(--accent)] hover:underline"
            >
              See all dashboards
            </button>
          )}
        </div>
        {recent === null && (
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="skeleton h-28" />
            <div className="skeleton h-28" />
            <div className="skeleton h-28" />
          </div>
        )}
        {recent && recent.length === 0 && (
          <p className="text-[0.9375rem] text-[var(--muted)]">
            Your dashboards will show up here. Start one with “
            {byId("dashboards").label}”.
          </p>
        )}
        {recent && recent.length > 0 && (
          <ul className="grid gap-5 sm:grid-cols-3">
            {recent.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => {
                    try {
                      sessionStorage.setItem("resector_open_dashboard", d.id);
                    } catch {
                      /* not remembered */
                    }
                    onOpenDashboards();
                  }}
                  className="card flex h-full min-h-28 w-full flex-col p-5 text-left"
                >
                  <span className="truncate text-[0.9375rem] font-semibold">
                    {d.title}
                  </span>
                  <span className="mt-auto pt-4 text-sm text-[var(--muted)]">
                    {d.papers} {d.papers === 1 ? "paper" : "papers"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-14" aria-labelledby="help-h">
        <h3
          id="help-h"
          className="mb-4 text-sm font-semibold text-[var(--muted)]"
        >
          Quick helpers
        </h3>
        <ul className="flex flex-wrap gap-3">
          {HELPERS.map((id) => {
            const t = byId(id);
            return (
              <li key={id}>
                <button
                  onClick={() => onPick(id)}
                  style={toneOf(t.color)}
                  title={t.blurb}
                  className="flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] py-2 pl-2 pr-4 text-[0.9375rem] font-medium transition-colors hover:border-[var(--t)]"
                >
                  <span className="tool-chip h-8 w-8 !rounded-full">
                    {t.icon}
                  </span>
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-16 text-sm text-[var(--subtle)]">
        <GitHubLink />
      </p>
    </div>
  );
}
