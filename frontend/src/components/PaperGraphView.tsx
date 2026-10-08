"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import dynamic from "next/dynamic";
import {
  Search,
  RotateCcw,
  Loader2,
  ExternalLink,
  Copy,
  CheckCircle,
  X,
  Calendar,
  Users,
  Quote,
  Info,
  Play,
} from "lucide-react";

// Dynamically import ForceGraph2D with SSR disabled
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-[var(--muted)]">
      <Loader2 className="mr-2 h-5 w-5 animate-spin text-[var(--accent)]" />
      Loading network canvas...
    </div>
  ),
});

export interface GraphNode {
  id: string;
  paperId: string;
  title: string;
  year?: number | null;
  authors?: string[];
  citationCount?: number;
  referenceCount?: number;
  abstract?: string;
  url?: string;
  is_root?: boolean;
  distance?: number;
  cluster?: number;
  importance?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  type?: string;
}

export interface GraphData {
  session_id?: string;
  root_paper_id?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  total_nodes?: number;
  total_edges?: number;
}

// Cluster color palette matching Connected Papers / Citation Graph / VOSviewer aesthetic
const CLUSTER_COLORS = [
  "#f97316", // Vibrant Orange
  "#22c55e", // Bright Green
  "#a855f7", // Purple
  "#3b82f6", // Electric Blue
  "#ef4444", // Crimson Red
  "#8d6e63", // Earth Brown
  "#eab308", // Amber Yellow
  "#06b6d4", // Cyan Teal
];

const PRESET_PAPERS = [
  {
    title: "Human-Level Control Through Deep RL (DQN)",
    query: "Human level control through deep reinforcement learning",
  },
  {
    title: "Attention Is All You Need (Transformer)",
    query: "Attention Is All You Need",
  },
  {
    title: "Deep Residual Learning for Image Recognition (ResNet)",
    query: "Deep Residual Learning for Image Recognition",
  },
  {
    title: "BERT: Pre-training Deep Bidirectional Transformers",
    query: "BERT: Pre-training of Deep Bidirectional Transformers",
  },
];

function wrapTitleIntoLines(
  text: string,
  maxChars: number = 22,
  maxLines: number = 4,
): string[] {
  if (!text) return ["Untitled Paper"];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";

  for (const w of words) {
    if ((cur + " " + w).trim().length <= maxChars) {
      cur = (cur + " " + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === 0) lines.push(text.slice(0, maxChars));
  return lines;
}

export default function PaperGraphView({
  initialQuery = "",
  onSelectPaper,
}: {
  initialQuery?: string;
  onSelectPaper?: (paper: GraphNode) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [titleSearch, setTitleSearch] = useState("");
  const [titleSlider, setTitleSlider] = useState<number>(65); // 0 - 100 threshold
  const [importanceSlider, setImportanceSlider] = useState<number>(35); // 0 - 100 node size scale
  const [layoutMode, setLayoutMode] = useState<"force" | "clusters" | "years">(
    "force",
  );
  const [isPhysicsRunning, setIsPhysicsRunning] = useState<boolean>(true);

  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 650 });

  // Synchronize theme with website (data-theme, dark class, and localStorage)
  useEffect(() => {
    const updateTheme = () => {
      const isDark =
        document.documentElement.dataset.theme === "dark" ||
        document.documentElement.classList.contains("dark") ||
        localStorage.getItem("resector_theme") === "dark";
      setIsDarkTheme(isDark);
      if (fgRef.current?.d3ReheatSimulation) {
        fgRef.current.d3ReheatSimulation();
      }
    };

    updateTheme();
    const obs = new MutationObserver(updateTheme);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    window.addEventListener("storage", updateTheme);
    return () => {
      obs.disconnect();
      window.removeEventListener("storage", updateTheme);
    };
  }, []);

  // Responsive dimension updates for canvas
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth || 900,
          height: containerRef.current.clientHeight || 650,
        });
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [graphData]);

  // Load API keys from localStorage
  const getApiConfig = useCallback(() => {
    if (typeof window === "undefined")
      return { tavilyApiKey: "", s2ApiKey: "" };
    try {
      const saved = localStorage.getItem("resector_config");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          tavilyApiKey: parsed.tavilyApiKey || "",
          s2ApiKey: parsed.s2ApiKey || "",
        };
      }
    } catch {
      // ignore
    }
    return { tavilyApiKey: "", s2ApiKey: "" };
  }, []);

  // Auto-generate graph when initialQuery is passed
  useEffect(() => {
    if (initialQuery && initialQuery.trim() && !graphData && !isLoading) {
      setQuery(initialQuery);
      handleGenerateGraph(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // Precompute importance ranking map for smooth title slider responsiveness
  const nodeRankMap = useMemo(() => {
    if (!graphData?.nodes || graphData.nodes.length === 0)
      return new Map<string, number>();
    const sorted = [...graphData.nodes].sort(
      (a, b) => (b.citationCount || 0) - (a.citationCount || 0),
    );
    const map = new Map<string, number>();
    const total = sorted.length;
    sorted.forEach((n, idx) => {
      // Percentile from 0.0 (top) to 1.0 (bottom)
      map.set(n.id, idx / total);
    });
    return map;
  }, [graphData]);

  // Handle title slider changes with immediate canvas repaint
  const handleTitleSliderChange = (newVal: number) => {
    setTitleSlider(newVal);
    if (fgRef.current?.d3ReheatSimulation) {
      fgRef.current.d3ReheatSimulation();
    }
  };

  // Handle importance slider changes with immediate canvas repaint
  const handleImportanceSliderChange = (newVal: number) => {
    setImportanceSlider(newVal);
    if (fgRef.current?.d3ReheatSimulation) {
      fgRef.current.d3ReheatSimulation();
    }
  };

  // Fetch or trigger graph generation
  const handleGenerateGraph = async (searchQuery: string = query) => {
    if (!searchQuery.trim()) {
      setErrorMsg("Please enter a research paper title, DOI, or arXiv ID.");
      return;
    }

    setIsLoading(true);
    setErrorMsg("");
    setSelectedNode(null);
    setLoadingStep("Querying OpenAlex & Semantic Scholar academic indices...");

    try {
      const { tavilyApiKey, s2ApiKey } = getApiConfig();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const sessionId = graphData?.session_id || `session_${Date.now()}`;

      const response = await fetch(`${apiUrl}/api/graph/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          query: searchQuery.trim(),
          max_nodes: 60,
          s2_api_key: s2ApiKey,
          tavily_api_key: tavilyApiKey,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server returned ${response.status}`);
      }

      setLoadingStep("Clustering topics and constructing citation web...");
      const data: GraphData = await response.json();

      const formattedData: GraphData = {
        ...data,
        nodes: data.nodes.map((n) => ({ ...n })),
        edges: data.edges.map((e) => ({ ...e })),
      };

      setGraphData(formattedData);

      const rootNode = formattedData.nodes.find(
        (n) => n.is_root || n.distance === 0,
      );
      if (rootNode) setSelectedNode(rootNode);

      setTimeout(() => {
        if (fgRef.current) {
          fgRef.current.zoomToFit(400, 70);
        }
      }, 700);
    } catch (err: unknown) {
      console.error("Graph generation error:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to generate citation graph.";
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  };

  // Layout mode effect (Force Atlas vs Clusters vs Years timeline)
  useEffect(() => {
    if (!graphData || !fgRef.current) return;

    if (layoutMode === "years") {
      const years = graphData.nodes.map((n) => n.year || 2020);
      const minYear = Math.min(...years);
      const maxYear = Math.max(...years);
      const yearSpan = Math.max(1, maxYear - minYear);

      graphData.nodes.forEach((node, i) => {
        const y = node.year || (minYear + maxYear) / 2;
        const normX = ((y - minYear) / yearSpan - 0.5) * 700;
        const normY = ((i % 12) - 6) * 55 + Math.sin(i) * 30;
        node.fx = normX;
        node.fy = normY;
      });
      if (fgRef.current.d3ReheatSimulation) fgRef.current.d3ReheatSimulation();
    } else if (layoutMode === "clusters") {
      const clusterCenters: { [key: number]: { cx: number; cy: number } } = {
        0: { cx: 0, cy: -200 },
        1: { cx: 220, cy: 0 },
        2: { cx: 180, cy: -180 },
        3: { cx: -200, cy: 180 },
        4: { cx: -180, cy: -80 },
        5: { cx: 60, cy: -250 },
        6: { cx: -60, cy: 220 },
        7: { cx: 200, cy: 180 },
      };

      graphData.nodes.forEach((node, i) => {
        if (node.is_root) {
          node.fx = 0;
          node.fy = 0;
        } else {
          const center = clusterCenters[node.cluster ?? 0] || { cx: 0, cy: 0 };
          const angle = i * 1.2;
          const r = 40 + (i % 5) * 20;
          node.fx = center.cx + Math.cos(angle) * r;
          node.fy = center.cy + Math.sin(angle) * r;
        }
      });
      if (fgRef.current.d3ReheatSimulation) fgRef.current.d3ReheatSimulation();
    } else {
      graphData.nodes.forEach((node) => {
        if (!node.is_root) {
          delete node.fx;
          delete node.fy;
        } else {
          node.fx = 0;
          node.fy = 0;
        }
      });
      if (fgRef.current.d3ReheatSimulation) fgRef.current.d3ReheatSimulation();
    }
  }, [layoutMode, graphData]);

  // Toggle physics running
  const togglePhysics = () => {
    if (!fgRef.current) return;
    if (isPhysicsRunning) {
      fgRef.current.pauseAnimation();
      setIsPhysicsRunning(false);
    } else {
      fgRef.current.resumeAnimation();
      setIsPhysicsRunning(true);
    }
  };

  // Node color mapping by cluster or root status
  const getNodeColor = useCallback(
    (node: GraphNode) => {
      if (node.is_root || node.distance === 0) {
        return isDarkTheme ? "#1e293b" : "#2d3436"; // Deep Charcoal Root
      }
      const clusterIdx = (node.cluster ?? 0) % CLUSTER_COLORS.length;
      return CLUSTER_COLORS[clusterIdx];
    },
    [isDarkTheme],
  );

  // Dynamic node sizing based on importance & slider
  const getNodeRadius = useCallback(
    (node: GraphNode) => {
      if (node.is_root) return 18;
      const base =
        5 + (node.importance || 0.3) * (6 + (importanceSlider / 100) * 16);
      return Math.max(4, Math.min(26, base));
    },
    [importanceSlider],
  );

  // Custom Node Canvas Painter
  const drawNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isSelected = selectedNode?.id === node.id;
      const isRoot = node.is_root || node.distance === 0;
      const radius = getNodeRadius(node);

      // Search match filtering
      const isSearchMatch =
        !titleSearch.trim() ||
        (node.title &&
          node.title.toLowerCase().includes(titleSearch.toLowerCase()));

      const nodeAlpha = isSearchMatch ? 1.0 : 0.18;
      ctx.globalAlpha = nodeAlpha;

      // Outer Halo for Root or Selected node
      if (isRoot || isSelected) {
        ctx.beginPath();
        ctx.arc(
          node.x,
          node.y,
          radius + (isRoot ? 4 : 3) / globalScale,
          0,
          2 * Math.PI,
          false,
        );
        ctx.fillStyle = isRoot
          ? isDarkTheme
            ? "rgba(255, 255, 255, 0.25)"
            : "rgba(45, 52, 54, 0.2)"
          : "rgba(59, 130, 246, 0.35)";
        ctx.fill();
        ctx.strokeStyle = isRoot
          ? isDarkTheme
            ? "#f1f5f9"
            : "#2d3436"
          : "#3b82f6";
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      // Draw Main Node Bubble
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
      ctx.fillStyle = getNodeColor(node);
      ctx.fill();
      ctx.strokeStyle = isDarkTheme ? "#0e1624" : "#ffffff";
      ctx.lineWidth = 1.2 / globalScale;
      ctx.stroke();

      // Title threshold calculation: Rank-based percentile controlled by titleSlider (0 to 100)
      const rank = nodeRankMap.get(node.id) ?? 1.0;
      const sliderThreshold = titleSlider / 100;
      const shouldShowTitle =
        isRoot ||
        isSelected ||
        (titleSearch.trim().length > 0 && isSearchMatch) ||
        (titleSlider > 0 && rank <= sliderThreshold);

      if (shouldShowTitle && isSearchMatch) {
        const titleLines = wrapTitleIntoLines(
          node.title || "Untitled Paper",
          isRoot ? 26 : 20,
          isRoot ? 4 : 3,
        );
        const year = node.year;

        const fontSize = Math.max(
          8.5 / globalScale,
          isRoot ? 11.5 / globalScale : 9.5 / globalScale,
        );
        ctx.font = `${isRoot || isSelected ? "600 " : "500 "}${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        const lineHeight = fontSize * 1.2;
        const textY = node.y + radius + 3 / globalScale;

        // Draw background pill behind text for high-contrast crisp readability
        ctx.fillStyle = isDarkTheme
          ? "rgba(21, 31, 48, 0.94)"
          : "rgba(255, 255, 255, 0.95)";
        ctx.strokeStyle = isDarkTheme
          ? "rgba(43, 58, 81, 0.85)"
          : "rgba(215, 222, 234, 0.9)";
        ctx.lineWidth = 0.8 / globalScale;

        const maxW = Math.max(
          ...titleLines.map((line) => ctx.measureText(line).width),
        );
        const totalH =
          titleLines.length * lineHeight + (year ? fontSize * 0.9 : 0);
        const pad = 3 / globalScale;

        ctx.fillRect(
          node.x - maxW / 2 - pad,
          textY - 1 / globalScale,
          maxW + pad * 2,
          totalH + pad,
        );
        ctx.strokeRect(
          node.x - maxW / 2 - pad,
          textY - 1 / globalScale,
          maxW + pad * 2,
          totalH + pad,
        );

        // Draw Paper Title Text
        ctx.fillStyle = isDarkTheme ? "#e8edf6" : "#162033";
        titleLines.forEach((line, idx) => {
          ctx.fillText(line, node.x, textY + idx * lineHeight);
        });

        // Draw Publication Year underneath
        if (year) {
          const yearY = textY + titleLines.length * lineHeight;
          const yearFontSize = fontSize * 0.88;
          ctx.font = `400 ${yearFontSize}px sans-serif`;
          ctx.fillStyle = isDarkTheme ? "#9aa8ba" : "#667085";
          ctx.fillText(`${year}`, node.x, yearY);
        }
      }

      ctx.globalAlpha = 1.0;
    },
    [
      selectedNode,
      isDarkTheme,
      titleSearch,
      titleSlider,
      nodeRankMap,
      getNodeColor,
      getNodeRadius,
    ],
  );

  // Export GEXF graph file for Gephi / Cytoscape
  const handleExportGEXF = () => {
    if (!graphData) return;
    const gexfContent = `<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://www.gexf.net/1.2draft" version="1.2">
  <meta>
    <creator>Resector Citation Graph Engine</creator>
    <description>Academic Citation & Reference Network</description>
  </meta>
  <graph defaultedgetype="directed">
    <nodes>
      ${graphData.nodes
        .map(
          (n) =>
            `<node id="${n.id}" label="${(n.title || "").replace(/[<>&"]/g, "")}">
              <attvalues>
                <attvalue for="year" value="${n.year || ""}"/>
                <attvalue for="citations" value="${n.citationCount || 0}"/>
                <attvalue for="cluster" value="${n.cluster || 0}"/>
              </attvalues>
            </node>`,
        )
        .join("\n      ")}
    </nodes>
    <edges>
      ${graphData.edges
        .map(
          (e, idx) =>
            `<edge id="${idx}" source="${typeof e.source === "object" ? (e.source as GraphNode).id : e.source}" target="${
              typeof e.target === "object"
                ? (e.target as GraphNode).id
                : e.target
            }" />`,
        )
        .join("\n      ")}
    </edges>
  </graph>
</gexf>`;

    const blob = new Blob([gexfContent], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `citation_graph_${Date.now()}.gexf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCitation = (paper: GraphNode) => {
    const authorsStr =
      paper.authors && paper.authors.length > 0
        ? paper.authors.join(", ")
        : "Unknown Authors";
    const citation = `${authorsStr}. "${paper.title}". ${paper.year ? `(${paper.year})` : ""}`;
    navigator.clipboard.writeText(citation);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleOpenPaper = (paper: GraphNode) => {
    if (paper.url) {
      window.open(paper.url, "_blank", "noopener,noreferrer");
    } else if (paper.paperId && !paper.paperId.startsWith("paper_")) {
      window.open(
        `https://www.semanticscholar.org/paper/${paper.paperId}`,
        "_blank",
        "noopener,noreferrer",
      );
    } else {
      window.open(
        `https://scholar.google.com/scholar?q=${encodeURIComponent(paper.title)}`,
        "_blank",
        "noopener,noreferrer",
      );
    }
  };

  const formattedGraph = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };
    return {
      nodes: graphData.nodes,
      links: graphData.edges.map((e) => ({
        source:
          typeof e.source === "object" ? (e.source as GraphNode).id : e.source,
        target:
          typeof e.target === "object" ? (e.target as GraphNode).id : e.target,
        type: e.type,
      })),
    };
  }, [graphData]);

  return (
    <div className="flex h-full w-full flex-col bg-[var(--background)] text-[var(--foreground)] transition-colors duration-200">
      {/* Control Bar (Search in titles, Sliders, Layout buttons) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 shadow-sm">
        {/* Left: Search in titles filter */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative w-52 sm:w-64">
            <input
              type="text"
              value={titleSearch}
              onChange={(e) => {
                setTitleSearch(e.target.value);
                if (fgRef.current?.d3ReheatSimulation)
                  fgRef.current.d3ReheatSimulation();
              }}
              placeholder="search in titles..."
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--foreground)] placeholder-[var(--muted)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:outline-none"
            />
            {titleSearch && (
              <button
                onClick={() => {
                  setTitleSearch("");
                  if (fgRef.current?.d3ReheatSimulation)
                    fgRef.current.d3ReheatSimulation();
                }}
                className="absolute right-2.5 top-2 text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Titles Density Slider */}
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span className="text-[11px] font-medium">Titles</span>
            <input
              type="range"
              min="0"
              max="100"
              value={titleSlider}
              onChange={(e) => handleTitleSliderChange(Number(e.target.value))}
              className="h-1.5 w-24 cursor-pointer accent-[var(--accent)]"
              title={`Title Density: ${titleSlider}%`}
            />
          </div>

          {/* Importance / Size Slider */}
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span className="text-[11px] font-medium">Importance</span>
            <input
              type="range"
              min="0"
              max="100"
              value={importanceSlider}
              onChange={(e) =>
                handleImportanceSliderChange(Number(e.target.value))
              }
              className="h-1.5 w-24 cursor-pointer accent-[var(--accent)]"
              title={`Importance Scale: ${importanceSlider}%`}
            />
          </div>
        </div>

        {/* Right: Layout Switchers & Recenter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[var(--muted)]">
            Layouts:
          </span>
          <div className="flex rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-0.5">
            <button
              onClick={() => {
                setLayoutMode("force");
                if (!isPhysicsRunning) togglePhysics();
              }}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all ${
                layoutMode === "force"
                  ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <span>Force Atlas</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  togglePhysics();
                }}
                title={
                  isPhysicsRunning ? "Pause simulation" : "Resume simulation"
                }
              >
                {isPhysicsRunning ? (
                  <span className="inline-block h-2 w-2 rounded-sm bg-[var(--foreground)]"></span>
                ) : (
                  <Play size={10} />
                )}
              </span>
            </button>

            <button
              onClick={() => setLayoutMode("clusters")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
                layoutMode === "clusters"
                  ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Clusters
            </button>

            <button
              onClick={() => setLayoutMode("years")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
                layoutMode === "years"
                  ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Years
            </button>
          </div>

          <button
            onClick={() => fgRef.current?.zoomToFit(400, 60)}
            title="Reset & Center View"
            className="flex h-7 items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-medium text-[var(--foreground)] shadow-sm hover:bg-[var(--surface-muted)]"
          >
            <RotateCcw size={12} />
            <span>Recenter</span>
          </button>
        </div>
      </div>

      {/* Query Bar (when exploring or changing seed paper) */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-muted)] px-5 py-2 text-xs">
        <div className="flex flex-1 items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGenerateGraph()}
            placeholder="Search academic paper title, DOI, or arXiv to build 50+ citation network..."
            className="w-full max-w-xl rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
          />
          <button
            onClick={() => handleGenerateGraph()}
            disabled={isLoading || !query.trim()}
            className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Search size={13} />
            )}
            <span>Explore</span>
          </button>
        </div>

        {/* Quick Presets */}
        <div className="hidden items-center gap-2 text-[11px] text-[var(--muted)] lg:flex">
          <span>Presets:</span>
          {PRESET_PAPERS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => {
                setQuery(preset.query);
                handleGenerateGraph(preset.query);
              }}
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[var(--foreground)] shadow-sm transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {preset.title.split("(")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-[var(--background)]"
      >
        {/* Loading Spinner */}
        {isLoading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[var(--background)]/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
              <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" />
              <p className="text-sm font-semibold">
                {loadingStep || "Building Academic Citation Graph..."}
              </p>
              <p className="text-xs text-[var(--muted)]">
                Traversing 50+ papers and clustering topics...
              </p>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {errorMsg && (
          <div className="absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[var(--danger)] bg-[var(--surface)] px-4 py-2 text-xs text-[var(--danger)] shadow-lg">
            <Info size={14} />
            <span>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg("")}
              className="ml-2 font-bold hover:opacity-75"
            >
              &times;
            </button>
          </div>
        )}

        {/* Empty State */}
        {!graphData && !isLoading && (
          <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
            <h3 className="text-xl font-bold tracking-tight">
              Interactive Academic Citation Network
            </h3>
            <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
              Enter any research paper or choose a seminal preset to generate a
              dense, multi-cluster citation network like Connected Papers.
            </p>
          </div>
        )}

        {/* ForceGraph2D Canvas */}
        {graphData && (
          <>
            <ForceGraph2D
              ref={fgRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={formattedGraph}
              backgroundColor={isDarkTheme ? "#0e1624" : "#f5f7fb"}
              nodeCanvasObject={drawNode}
              nodePointerAreaPaint={(node: any, color, ctx) => {
                ctx.fillStyle = color;
                const r = getNodeRadius(node) + 6;
                ctx.beginPath();
                ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
                ctx.fill();
              }}
              onNodeClick={(node: any) => {
                setSelectedNode(node);
                if (onSelectPaper) onSelectPaper(node);
              }}
              linkDirectionalArrowLength={0}
              linkColor={() =>
                isDarkTheme
                  ? "rgba(64, 83, 111, 0.45)"
                  : "rgba(185, 197, 214, 0.75)"
              }
              linkWidth={1.0}
              d3AlphaDecay={0.018}
              d3VelocityDecay={0.3}
              warmupTicks={50}
              cooldownTicks={180}
            />

            {/* Bottom-Left: Export GEXF / Data Control */}
            <div className="absolute bottom-5 left-5 z-20 flex items-center gap-2">
              <button
                onClick={handleExportGEXF}
                title="Export network graph in GEXF format for Gephi / Cytoscape"
                className="rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] shadow-sm transition-all hover:bg-[var(--surface-muted)]"
              >
                Export GEXF
              </button>

              <div className="rounded border border-[var(--border)] bg-[var(--surface)]/90 px-3 py-1.5 text-[11px] font-medium text-[var(--muted)] shadow-sm backdrop-blur-sm">
                <span>
                  {graphData.total_nodes || graphData.nodes.length} papers
                </span>
                <span className="mx-1.5 text-[var(--border-strong)]">•</span>
                <span>
                  {graphData.total_edges || graphData.edges.length} connections
                </span>
              </div>
            </div>

            {/* Paper Inspector Side Card */}
            {selectedNode && (
              <div className="absolute bottom-5 right-5 z-20 max-h-[82%] w-full max-w-sm overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/98 p-5 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-2 duration-200 sm:max-w-md">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {selectedNode.is_root ? (
                      <span className="rounded bg-[var(--foreground)] px-2 py-0.5 text-[10px] font-bold text-[var(--surface)]">
                        ROOT PAPER
                      </span>
                    ) : (
                      <span
                        className="rounded px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: getNodeColor(selectedNode) }}
                      >
                        CLUSTER #{selectedNode.cluster ?? 0}
                      </span>
                    )}
                    <span className="text-[11px] text-[var(--muted)]">
                      Hop Distance: {selectedNode.distance ?? 0}
                    </span>
                  </div>

                  <button
                    onClick={() => setSelectedNode(null)}
                    className="rounded p-1 text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                  >
                    <X size={15} />
                  </button>
                </div>

                <h4 className="text-base font-bold leading-snug text-[var(--foreground)]">
                  {selectedNode.title}
                </h4>

                <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
                  {selectedNode.year && (
                    <div className="flex items-center gap-1">
                      <Calendar size={13} />
                      <span>{selectedNode.year}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 font-semibold text-[var(--accent)]">
                    <Quote size={13} />
                    <span>{selectedNode.citationCount || 0} citations</span>
                  </div>
                  {selectedNode.authors && selectedNode.authors.length > 0 && (
                    <div className="flex items-center gap-1 text-[var(--muted)]">
                      <Users size={13} />
                      <span className="line-clamp-1">
                        {selectedNode.authors.join(", ")}
                      </span>
                    </div>
                  )}
                </div>

                {selectedNode.abstract ? (
                  <div className="mt-3 border-t border-[var(--border)] pt-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--subtle)]">
                      Abstract Preview
                    </p>
                    <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-[var(--foreground)]/90">
                      {selectedNode.abstract}
                    </p>
                  </div>
                ) : null}

                <div className="mt-4 flex gap-2 border-t border-[var(--border)] pt-3">
                  <button
                    onClick={() => handleOpenPaper(selectedNode)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] py-2 text-xs font-semibold text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-strong)]"
                  >
                    <ExternalLink size={13} />
                    <span>Open Paper</span>
                  </button>

                  <button
                    onClick={() => {
                      setQuery(selectedNode.title);
                      handleGenerateGraph(
                        selectedNode.paperId || selectedNode.title,
                      );
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] py-2 text-xs font-medium text-[var(--foreground)] transition-colors hover:border-[var(--border-strong)]"
                  >
                    <RotateCcw size={13} />
                    <span>Center On This</span>
                  </button>

                  <button
                    onClick={() => handleCopyCitation(selectedNode)}
                    title="Copy Citation format"
                    className="flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    {isCopied ? (
                      <CheckCircle
                        size={14}
                        className="text-[var(--success)]"
                      />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
