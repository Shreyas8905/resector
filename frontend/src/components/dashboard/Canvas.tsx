"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge, Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider,
  useEdgesState, useNodesState, useReactFlow, type Connection, type Edge, type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft, Check, Download, FilePlus2, Frame, Gauge, Library, Loader2, MessageSquare, Redo2, Search,
  LayoutGrid, Link2, Sparkles, StickyNote, Table2, Target, Trash2, Undo2, Upload, X,
} from "lucide-react";
import {
  aiConfig, dashboardApi, type Cite, type CommentInfo, type DashboardFull, type DocInfo, type ExcerptInfo,
  type AgentState, type Suggestion, type TableRow, type UsageTotals,
} from "@/lib/dashboardApi";
import { edgeFromSuggestion, ghostLinks, nodeFor, suggestionForEdge, RELATION_LABEL } from "@/lib/wiring";
import { formatTokens } from "@/lib/citations";
import { friendlyError, openSettings } from "@/lib/errors";
import { useDialogs } from "@/components/ui/Dialogs";
import { ResizeHandle, panelStyle, usePanelWidth } from "@/components/ui/Resizable";
import AskPanel from "./AskPanel";
import CompareDialog from "./CompareDialog";
import ConnectionsPanel from "./ConnectionsPanel";
import MatrixView from "./MatrixView";
import SuggestionCard from "./SuggestionCard";
import type { Rect } from "@/lib/rects";
import { CanvasContext, EDGE_KINDS, type CanvasCtx } from "./context";
import { nodeTypes } from "./nodes";
import PdfReader, { type ReaderFocus } from "./PdfReader";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const kindInfo = (k: string) => EDGE_KINDS.find((x) => x.id === k) ?? EDGE_KINDS[0];
const MAX_HISTORY = 60;

type Snap = { nodes: Node[]; edges: Edge[] };

function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

function serialize(nodes: Node[], edges: Edge[]) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id, type: n.type, position: n.position, data: n.data,
      ...(n.type === "frame" ? { width: n.width ?? 520, height: n.height ?? 320 } : {}),
    })),
    edges: edges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null, data: e.data ?? {},
    })),
  };
}

function toRfNode(n: any): Node {
  return {
    id: n.id, type: n.type, position: n.position, data: n.data ?? {},
    ...(n.type === "frame" ? { width: n.width ?? 520, height: n.height ?? 320, zIndex: -1 } : {}),
  };
}
const toRfEdge = (e: any): Edge => ({
  id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined,
  targetHandle: e.targetHandle ?? undefined, data: e.data ?? { kind: "related", label: "" },
});

export default function Canvas(props: { dashboardId: string; onBack: () => void }) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ dashboardId, onBack }: { dashboardId: string; onBack: () => void }) {
  const dark = useDarkMode();
  const rf = useReactFlow();
  const [dash, setDash] = useState<DashboardFull | null>(null);
  const [loadError, setLoadError] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [documents, setDocuments] = useState<DocInfo[]>([]);
  const [excerpts, setExcerpts] = useState<ExcerptInfo[]>([]);
  const [comments, setComments] = useState<CommentInfo[]>([]);
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [query, setQuery] = useState("");
  const [reader, setReader] = useState<{ documentId: number; focus: ReaderFocus } | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentTarget, setCommentTarget] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [usage, setUsage] = useState<UsageTotals | null>(null);
  const [agent, setAgent] = useState<AgentState | null>(null);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [view, setView] = useState<"canvas" | "matrix">("canvas");
  const [ghostId, setGhostId] = useState<number | null>(null);
  const [summarizing, setSummarizing] = useState<Set<string>>(new Set());
  const { confirm, notify, dialogs } = useDialogs();
  const readerPanel = usePanelWidth("dash_reader", 560, 340, 1100);
  const commentsPanel = usePanelWidth("dash_comments", 320, 240, 560);
  const fileInput = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const undoStack = useRef<Snap[]>([]);
  const redoStack = useRef<Snap[]>([]);
  const [, bump] = useState(0);
  const lastSaved = useRef("");
  const loaded = useRef(false);
  const documentsRef = useRef<DocInfo[]>([]);
  const excerptsRef = useRef<ExcerptInfo[]>([]);
  documentsRef.current = documents;
  excerptsRef.current = excerpts;

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice((x) => (x === m ? "" : x)), 4000); };

  // ---------------------------------------------------------------- load
  useEffect(() => {
    let off = false;
    loaded.current = false;
    dashboardApi.get(dashboardId).then((d) => {
      if (off) return;
      const ns = d.nodes.map(toRfNode), es = d.edges.map(toRfEdge);
      setDash(d); setTitle(d.title); setNodes(ns); setEdges(es);
      setDocuments(d.documents); setExcerpts(d.excerpts); setComments(d.comments);
      lastSaved.current = JSON.stringify(serialize(ns, es));
      loaded.current = true;
      window.setTimeout(() => rf.fitView({ padding: 0.2, maxZoom: 1 }), 50);
      dashboardApi.usage(dashboardId).then((u) => !off && setUsage(u)).catch(() => {});
      dashboardApi.agent(dashboardId).then((a) => !off && setAgent(a)).catch(() => {});
    }).catch((e) => !off && setLoadError(e.message || "Could not open this dashboard."));
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId]);

  // ---------------------------------------------------------------- autosave
  useEffect(() => {
    if (!loaded.current) return;
    const key = JSON.stringify(serialize(nodes, edges));
    if (key === lastSaved.current) return;
    setSaveState("saving");
    const t = window.setTimeout(async () => {
      try {
        const s = serialize(nodes, edges);
        await dashboardApi.saveCanvas(dashboardId, s.nodes, s.edges);
        lastSaved.current = key;
        setSaveState("saved");
      } catch { setSaveState("error"); }
    }, 800);
    return () => window.clearTimeout(t);
  }, [nodes, edges, dashboardId]);

  // Keep indexing progress fresh while any paper is still being read.
  useEffect(() => {
    if (!documents.some((d) => d.status !== "completed" && d.status !== "failed")) return;
    const t = window.setInterval(() => {
      dashboardApi.documents(dashboardId).then(setDocuments).catch(() => {});
    }, 2000);
    return () => window.clearInterval(t);
  }, [documents, dashboardId]);

  // ---------------------------------------------------------------- history
  const clean = (ns: Node[], es: Edge[]): Snap => ({
    nodes: ns.map((n) => ({ ...n, selected: false, dragging: false })),
    edges: es.map((e) => ({ ...e, selected: false })),
  });
  const snapshot = useCallback(() => {
    const s = clean(nodesRef.current, edgesRef.current);
    const top = undoStack.current[undoStack.current.length - 1];
    if (top && JSON.stringify(serialize(top.nodes, top.edges)) === JSON.stringify(serialize(s.nodes, s.edges))) return;
    undoStack.current.push(s);
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
    bump((x) => x + 1);
  }, []);

  const restore = useCallback((s: Snap) => {
    // A paper or excerpt that was deleted for real cannot come back, so drop its cards.
    const docIds = new Set(documentsRef.current.map((d) => d.id));
    const exIds = new Set(excerptsRef.current.map((e) => e.id));
    const ns = s.nodes.filter((n) =>
      n.type === "paper" ? docIds.has((n.data as any).document_id)
        : n.type === "excerpt" ? exIds.has((n.data as any).excerpt_id) : true);
    const ids = new Set(ns.map((n) => n.id));
    setNodes(ns);
    setEdges(s.edges.filter((e) => ids.has(e.source) && ids.has(e.target)));
  }, [setNodes, setEdges]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(clean(nodesRef.current, edgesRef.current));
    restore(prev); bump((x) => x + 1);
  }, [restore]);
  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(clean(nodesRef.current, edgesRef.current));
    restore(next); bump((x) => x + 1);
  }, [restore]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
  };

  // ---------------------------------------------------------------- node helpers
  const centerPosition = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    return rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 800) / 2, y: (r?.top ?? 0) + (r?.height ?? 600) / 2 });
  };

  const addNode = (type: string, data: Record<string, unknown>, position?: { x: number; y: number }) => {
    snapshot();
    const p = position ?? centerPosition();
    const node: Node = {
      id: uid(type), type, position: { x: p.x - 120 + Math.random() * 30, y: p.y - 60 + Math.random() * 30 }, data,
      ...(type === "frame" ? { width: 520, height: 320, zIndex: -1 } : {}),
    };
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { ...node, selected: true }]);
    return node;
  };

  const update = useCallback((id: string, patch: Record<string, unknown>) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, [setNodes]);

  // ---------------------------------------------------------------- papers
  const placePapers = (docIds: number[], origin?: { x: number; y: number }) => {
    snapshot();
    const base = origin ?? centerPosition();
    setNodes((ns) => [
      ...ns,
      ...docIds.map((id, i): Node => ({
        id: uid("paper"), type: "paper", position: { x: base.x - 150 + (i % 3) * 330, y: base.y - 60 + Math.floor(i / 3) * 190 },
        data: { document_id: id, expanded: false },
      })),
    ]);
  };

  const uploadFiles = async (files: File[], origin?: { x: number; y: number }) => {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length || !dash) { if (files.length) flash("Only PDF files can be added."); return; }
    setBusy(`Uploading ${pdfs.length} ${pdfs.length === 1 ? "paper" : "papers"}…`);
    try {
      const ids = await dashboardApi.upload(dash.session_id, pdfs);
      setDocuments(await dashboardApi.documents(dashboardId));
      placePapers(ids, origin);
    } catch (e: any) { flash(e.message || "Upload failed."); } finally { setBusy(""); }
  };

  const importFromLibrary = async (ids: number[]) => {
    setImportOpen(false);
    if (!ids.length) return;
    setBusy("Adding papers…");
    try {
      const created = await dashboardApi.importPapers(dashboardId, ids);
      setDocuments(await dashboardApi.documents(dashboardId));
      placePapers(created.map((d) => d.id));
    } catch (e: any) { flash(e.message || "Could not add those papers."); } finally { setBusy(""); }
  };

  // ---------------------------------------------------------------- reader
  const openReader = useCallback((documentId: number, excerptId?: number) => {
    setReader({ documentId, focus: excerptId ? { excerptId, nonce: Date.now() } : null });
  }, []);

  const refreshAgent = useCallback(() => {
    dashboardApi.agent(dashboardId).then(setAgent).catch(() => {});
  }, [dashboardId]);

  // While an agent run is going, keep progress and new suggestions fresh.
  const runningId = agent?.running?.id ?? null;
  useEffect(() => {
    if (runningId == null) return;
    const t = window.setInterval(() => { refreshAgent(); refreshUsage(); }, 2000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningId, refreshAgent]);

  // Make sure the server has the latest canvas (claim text!) before an agent reads it.
  const flushSave = useCallback(async () => {
    const s = serialize(nodesRef.current, edgesRef.current);
    await dashboardApi.saveCanvas(dashboardId, s.nodes, s.edges);
    lastSaved.current = JSON.stringify(s);
  }, [dashboardId]);

  const acceptSuggestion = useCallback(async (sg: Suggestion) => {
    const e = edgeFromSuggestion(sg, nodesRef.current);
    if (!e) { flash("Both cards need to be on the canvas to add this link."); return; }
    snapshot();
    setEdges((es) => [...es, { id: uid("e"), source: e.source, target: e.target, data: e.data }]);
    setGhostId(null);
    setAgent((a) => a && { ...a, suggestions: a.suggestions.map((x) => (x.id === sg.id ? { ...x, status: "accepted" } : x)) });
    dashboardApi.setSuggestion(sg.id, "accepted").catch(() => flash("Could not save that decision."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, setEdges]);

  const dismissSuggestion = useCallback((sg: Suggestion) => {
    setGhostId(null);
    setAgent((a) => a && { ...a, suggestions: a.suggestions.filter((x) => x.id !== sg.id) });
    dashboardApi.setSuggestion(sg.id, "dismissed").catch(() => flash("Could not save that decision."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusSuggestion = useCallback((sg: Suggestion) => {
    const a = nodeFor(nodesRef.current, sg.a_kind, sg.a_ref), b = nodeFor(nodesRef.current, sg.b_kind, sg.b_ref);
    if (!a || !b) { flash("Both cards need to be on the canvas."); return; }
    setView("canvas");
    setGhostId(sg.id);
    window.setTimeout(() => rf.fitView({ nodes: [{ id: a.id }, { id: b.id }], padding: 0.5, duration: 400, maxZoom: 1 }), 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshUsage = useCallback(() => {
    dashboardApi.usage(dashboardId).then(setUsage).catch(() => {});
  }, [dashboardId]);

  // A citation chip was clicked: open the paper at that passage (finding its exact position if needed).
  const openCite = useCallback(async (c: Cite) => {
    let page = c.page ?? null;
    let rects = c.rects ?? [];
    if (!rects.length || !page) {
      try {
        const r = await dashboardApi.locate(dashboardId, c.document_id, c.quote, c.page);
        page = r.page ?? page;
        if (!rects.length) rects = r.rects;
      } catch { /* fall through to a plain open */ }
    }
    if (!page) {
      flash("Couldn't pinpoint that passage, so the paper is opened instead.");
      setReader({ documentId: c.document_id, focus: null });
      return;
    }
    setReader({ documentId: c.document_id, focus: { temp: { page, rects }, nonce: Date.now() } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId]);

  const openPage = useCallback((documentId: number, page: number) => {
    setReader({ documentId, focus: { temp: { page, rects: [] }, nonce: Date.now() } });
  }, []);

  const summarize = useCallback(async (nodeId: string) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    const docId = (node.data as any).document_id as number;
    if (!aiConfig().api_key) { notify("Add your AI provider key in Settings first.", "error"); openSettings(); return; }
    try {
      const e = await dashboardApi.estimate(dashboardId, "summarize", [docId]);
      const total = e.tokens_in + e.tokens_out;
      if (total > 30000 && !(await confirm({
        title: "This is a large summary",
        message: `Reading this paper will use about ${formatTokens(total)} tokens from your AI provider. Continue?`,
        confirmLabel: "Summarize",
      }))) return;
    } catch { /* estimate is only a courtesy */ }
    setSummarizing((s) => new Set(s).add(nodeId));
    try {
      const r = await dashboardApi.summarize(dashboardId, docId);
      snapshot();
      update(nodeId, { summary: r.summary, expanded: true });
      refreshUsage();
    } catch (e) {
      notify(friendlyError(e), "error");
    } finally {
      setSummarizing((s) => { const n = new Set(s); n.delete(nodeId); return n; });
    }
  }, [dashboardId, confirm, notify, snapshot, update, refreshUsage]);

  const pinAnswer = (question: string, answer: string, cites: Cite[]) => {
    addNode("answer", { question, answer, cites, note: "" });
    flash("Pinned to your canvas.");
  };

  const addTable = (columns: string[], rows: TableRow[]) => {
    addNode("table", { title: "Comparison", columns, rows });
    flash("Comparison table added to your canvas.");
  };

  const createExcerpt = async (kind: "text" | "area", page: number, rects: Rect[], quote: string) => {
    if (!reader) return;
    try {
      const ex = await dashboardApi.createExcerpt(dashboardId, { document_id: reader.documentId, page, kind, rects, quote });
      setExcerpts((x) => [...x, ex]);
      const paper = nodesRef.current.find((n) => n.type === "paper" && (n.data as any).document_id === reader.documentId);
      const count = nodesRef.current.filter((n) => n.type === "excerpt" && excerptsRef.current.find((e) => e.id === (n.data as any).excerpt_id)?.document_id === reader.documentId).length;
      const pos = paper ? { x: paper.position.x + 360, y: paper.position.y + count * 170 + 60 } : undefined;
      const node = addNode("excerpt", { excerpt_id: ex.id, note: "" }, pos);
      if (paper) setEdges((es) => [...es, { id: uid("e"), source: paper.id, target: node.id, data: { kind: "related", label: "" } }]);
      setReader((r) => (r ? { ...r, focus: { excerptId: ex.id, nonce: Date.now() } } : r));
      flash(kind === "area" ? "Saved the selected area to your canvas." : "Saved to your canvas.");
    } catch (e: any) { flash(e.message || "Could not save that selection."); }
  };

  // ---------------------------------------------------------------- deleting
  const onBeforeDelete = async ({ nodes: del, edges: delEdges }: { nodes: Node[]; edges: Edge[] }) => {
    const papers = del.filter((n) => n.type === "paper");
    if (papers.length) {
      const ok = await confirm({
        title: `Remove ${papers.length === 1 ? "this paper" : `these ${papers.length} papers`}?`,
        message: `The PDF and everything you saved from ${papers.length === 1 ? "it" : "them"} will be deleted. This can’t be undone.`,
        confirmLabel: "Remove", danger: true,
      });
      if (!ok) return false;
    }
    snapshot();
    return { nodes: del, edges: delEdges };
  };

  const onNodesDelete = async (del: Node[]) => {
    const gone = new Set(del.map((n) => n.id));
    for (const n of del) {
      if (n.type === "excerpt") {
        const id = (n.data as any).excerpt_id as number;
        dashboardApi.deleteExcerpt(id).catch(() => {});
        setExcerpts((x) => x.filter((e) => e.id !== id));
      } else if (n.type === "paper") {
        const docId = (n.data as any).document_id as number;
        const theirs = excerptsRef.current.filter((e) => e.document_id === docId).map((e) => e.id);
        const theirNodes = nodesRef.current.filter((m) => m.type === "excerpt" && theirs.includes((m.data as any).excerpt_id)).map((m) => m.id);
        theirNodes.forEach((id) => gone.add(id));
        theirs.forEach((id) => dashboardApi.deleteExcerpt(id).catch(() => {}));
        setExcerpts((x) => x.filter((e) => e.document_id !== docId));
        setNodes((ns) => ns.filter((m) => !theirNodes.includes(m.id)));
        setEdges((es) => es.filter((e) => !theirNodes.includes(e.source) && !theirNodes.includes(e.target)));
        dashboardApi.deleteDocument(docId).catch(() => flash("The paper was removed but its file could not be deleted."));
        setDocuments((d) => d.filter((x) => x.id !== docId));
        setReader((r) => (r && r.documentId === docId ? null : r));
      }
    }
    setComments((c) => c.filter((x) => !x.node_id || !gone.has(x.node_id)));
  };

  // ---------------------------------------------------------------- links
  const onConnect = useCallback((c: Connection) => {
    snapshot();
    setEdges((es) => addEdge({ ...c, id: uid("e"), data: { kind: "related", label: "" } }, es));
  }, [setEdges, snapshot]);

  const ghosts = useMemo(() => ghostLinks(agent?.suggestions ?? [], nodes, edges), [agent, nodes, edges]);
  const displayEdges = useMemo(() => {
    const real = edges.map((e) => {
      const k = kindInfo((e.data as any)?.kind ?? "related");
      const label = (e.data as any)?.label || ((e.data as any)?.kind && (e.data as any).kind !== "related" && (e.data as any).kind !== "custom" ? k.label : undefined);
      return {
        ...e, label, animated: false,
        style: { stroke: k.color, strokeWidth: e.selected ? 3 : 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: k.color },
        labelStyle: { fontSize: 11, fill: "var(--foreground)" },
        labelBgStyle: { fill: "var(--surface)", fillOpacity: 0.95 },
        labelBgPadding: [4, 2] as [number, number], labelBgBorderRadius: 4,
      } as Edge;
    });
    const ghost = ghosts.map((g) => {
      const k = kindInfo(g.suggestion.relation);
      return {
        id: g.id, source: g.source, target: g.target, animated: true, selectable: true, focusable: true,
        label: `? ${RELATION_LABEL[g.suggestion.relation]}`,
        style: { stroke: k.color, strokeWidth: ghostId === g.suggestion.id ? 3.5 : 2, strokeDasharray: "6 5", opacity: ghostId === g.suggestion.id ? 1 : 0.75 },
        markerEnd: { type: MarkerType.ArrowClosed, color: k.color },
        labelStyle: { fontSize: 11, fill: "var(--foreground)" },
        labelBgStyle: { fill: "var(--surface)", fillOpacity: 0.95 },
        labelBgPadding: [4, 2] as [number, number], labelBgBorderRadius: 4,
        data: { ghost: true },
      } as Edge;
    });
    return [...real, ...ghost];
  }, [edges, ghosts, ghostId]);

  const selectedEdge = edges.filter((e) => e.selected).length === 1 ? edges.find((e) => e.selected)! : null;
  const patchEdge = (id: string, patch: Record<string, unknown>) =>
    setEdges((es) => es.map((e) => (e.id === id ? { ...e, data: { ...e.data, ...patch } } : e)));

  // ---------------------------------------------------------------- search
  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const hits = new Set<string>();
    for (const n of nodes) {
      const d = n.data as any;
      let text = "";
      if (n.type === "paper") text = `${documents.find((x) => x.id === d.document_id)?.filename ?? ""} ${d.note ?? ""}`;
      else if (n.type === "excerpt") text = `${excerpts.find((x) => x.id === d.excerpt_id)?.quote ?? ""} ${d.note ?? ""}`;
      else if (n.type === "answer") text = `${d.question ?? ""} ${d.answer ?? ""} ${d.note ?? ""}`;
      else if (n.type === "table") text = `${d.title ?? ""} ${(d.columns ?? []).join(" ")} ${(d.rows ?? []).map((r: TableRow) => r.filename + " " + Object.values(r.cells).map((c) => c.text).join(" ")).join(" ")}`;
      else text = `${d.title ?? ""} ${d.text ?? ""}`;
      if (text.toLowerCase().includes(q)) hits.add(n.id);
    }
    return hits;
  }, [query, nodes, documents, excerpts]);

  const jumpToHits = () => {
    if (searchHits && searchHits.size) rf.fitView({ nodes: Array.from(searchHits).map((id) => ({ id })), padding: 0.4, duration: 400, maxZoom: 1.2 });
  };

  // ---------------------------------------------------------------- comments
  const commentCounts = useMemo(() => {
    const m = new Map<string, number>();
    comments.filter((c) => !c.resolved && c.node_id).forEach((c) => m.set(c.node_id!, (m.get(c.node_id!) ?? 0) + 1));
    return m;
  }, [comments]);

  const nodeLabel = (id: string | null) => {
    if (!id) return "Whole dashboard";
    const n = nodes.find((x) => x.id === id);
    if (!n) return "Removed card";
    const d = n.data as any;
    if (n.type === "paper") return documents.find((x) => x.id === d.document_id)?.filename ?? "Paper";
    if (n.type === "excerpt") return `Excerpt, page ${excerpts.find((x) => x.id === d.excerpt_id)?.page ?? "?"}`;
    if (n.type === "claim") return `My research: ${(d.text ?? "").slice(0, 30)}`;
    if (n.type === "answer") return `Answer: ${(d.question ?? "").slice(0, 30)}`;
    if (n.type === "table") return d.title || "Comparison table";
    return d.title || (d.text ?? "").slice(0, 30) || (n.type === "frame" ? "Group" : "Note");
  };

  const ctx: CanvasCtx = useMemo(() => ({
    docs: new Map(documents.map((d) => [d.id, d])),
    excerpts: new Map(excerpts.map((e) => [e.id, e])),
    commentCounts, searchHits, openReader, snapshot, update,
    comment: (id: string) => { setCommentTarget(id); setCommentsOpen(true); setAskOpen(false); setConnectionsOpen(false); },
    openCite, openPage, summarize, summarizing,
  }), [documents, excerpts, commentCounts, searchHits, openReader, snapshot, update, openCite, openPage, summarize, summarizing]);

  // What is selected on the canvas, as the scope for "Ask" and the default for "Compare".
  const selection = useMemo(() => {
    const docIds = new Set<number>(), exIds: number[] = [];
    for (const n of nodes) {
      if (!n.selected) continue;
      const d = n.data as any;
      if (n.type === "paper") docIds.add(d.document_id);
      if (n.type === "excerpt") {
        const ex = excerpts.find((e) => e.id === d.excerpt_id);
        if (ex) { exIds.push(ex.id); docIds.add(ex.document_id); }
      }
    }
    return { docIds: Array.from(docIds), excerptIds: exIds };
  }, [nodes, excerpts]);

  const claimCards = useMemo(
    () => nodes.filter((n) => n.type === "claim").map((n) => ({ id: n.id, text: String((n.data as any).text ?? "") })),
    [nodes]);
  const nameOf = useCallback((kind: string, ref: string) => {
    if (kind === "claim") return `“${(claimCards.find((c) => c.id === ref)?.text || "My research").slice(0, 40)}”`;
    return (documents.find((d) => String(d.id) === ref)?.filename ?? "Paper").replace(/\.pdf$/i, "");
  }, [claimCards, documents]);
  const ghostSuggestion = ghostId != null ? ghosts.find((g) => g.suggestion.id === ghostId)?.suggestion ?? null : null;
  const edgeEvidence = selectedEdge ? suggestionForEdge(selectedEdge, agent?.suggestions ?? [], nodes) : undefined;

  const readyPapers = useMemo(
    () => documents.filter((d) => d.status === "completed").map((d) => ({ id: d.id, name: d.filename.replace(/\.pdf$/i, "") })),
    [documents]);

  // ---------------------------------------------------------------- export
  const exportMarkdown = async (mode: "download" | "copy") => {
    try {
      const text = await (await fetch(dashboardApi.exportUrl(dashboardId))).text();
      if (mode === "copy") { await navigator.clipboard.writeText(text); flash("Copied as Markdown."); return; }
      const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
      const a = document.createElement("a");
      a.href = url; a.download = `${(title || "dashboard").replace(/[^\w\- ]+/g, "")}.md`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { flash("Could not export. Try “Copy Markdown” instead."); }
  };

  const renameDashboard = async () => {
    const t = title.trim();
    if (!t || t === dash?.title) return;
    try { await dashboardApi.rename(dashboardId, { title: t }); setDash((d) => (d ? { ...d, title: t } : d)); } catch { flash("Could not rename."); }
  };

  const addComment = async (text: string) => {
    try { const c = await dashboardApi.addComment(dashboardId, commentTarget, text); setComments((x) => [...x, c]); }
    catch (e: any) { flash(e.message || "Could not add the comment."); }
  };

  // ---------------------------------------------------------------- render
  if (loadError) return (
    <div className="p-8 text-sm"><p className="text-[var(--danger)]">{loadError}</p><button onClick={onBack} className="mt-3 underline">Back to dashboards</button></div>
  );
  if (!dash) return <div className="flex items-center gap-2 p-8 text-sm text-[var(--muted)]"><Loader2 size={15} className="animate-spin" /> Opening dashboard…</div>;

  const readerDoc = reader ? documents.find((d) => d.id === reader.documentId) : null;
  const tb = "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <CanvasContext.Provider value={ctx}>
      <div className="flex h-full min-h-0 flex-col" onKeyDown={onKeyDown}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
          <button onClick={onBack} className={tb} title="All dashboards"><ArrowLeft size={14} /> Dashboards</button>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={renameDashboard}
            aria-label="Dashboard name" className="min-w-0 max-w-xs flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-serif text-base font-semibold outline-none hover:border-[var(--border)] focus:border-[var(--accent)]" />
          <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
            {saveState === "saving" && <><Loader2 size={12} className="animate-spin" /> Saving…</>}
            {saveState === "saved" && <><Check size={12} /> Saved</>}
            {saveState === "error" && <span className="text-[var(--danger)]">Not saved. Retrying on your next change.</span>}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--subtle)]" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && jumpToHits()}
                placeholder="Find on canvas" aria-label="Find on canvas" className="w-44 rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-7 pr-2 text-xs outline-none focus:border-[var(--accent)]" />
            </div>
            <button className={tb} onClick={undo} disabled={!undoStack.current.length} title="Undo (Ctrl+Z)"><Undo2 size={14} /></button>
            <button className={tb} onClick={redo} disabled={!redoStack.current.length} title="Redo (Ctrl+Shift+Z)"><Redo2 size={14} /></button>
            {usage && usage.actions > 0 && (
              <span className="flex items-center gap-1 rounded-lg px-2 text-xs text-[var(--muted)]"
                title={`Tokens used by AI actions on this dashboard${usage.estimated ? " (partly estimated)" : ""}: ${usage.tokens_in.toLocaleString()} in, ${usage.tokens_out.toLocaleString()} out`}>
                <Gauge size={13} /> {formatTokens(usage.tokens_in + usage.tokens_out)} tokens
              </span>
            )}
            <div className="flex rounded-lg border border-[var(--border)] p-0.5" role="group" aria-label="View">
              <button className={`${tb} !px-2 !py-1 ${view === "canvas" ? "!bg-[var(--surface-strong)] !text-[var(--foreground)]" : ""}`} onClick={() => setView("canvas")} aria-pressed={view === "canvas"}>Canvas</button>
              <button className={`${tb} !px-2 !py-1 ${view === "matrix" ? "!bg-[var(--surface-strong)] !text-[var(--foreground)]" : ""}`} onClick={() => setView("matrix")} aria-pressed={view === "matrix"}><LayoutGrid size={13} /> Matrix</button>
            </div>
            <button className={`${tb} ${connectionsOpen ? "!bg-[var(--accent-soft)] !text-[var(--accent)]" : ""}`}
              onClick={() => { setConnectionsOpen((o) => !o); setAskOpen(false); setCommentsOpen(false); }}>
              <Link2 size={14} /> Connections{(agent?.suggestions ?? []).filter((x) => x.status === "pending").length > 0 && ` (${(agent?.suggestions ?? []).filter((x) => x.status === "pending").length})`}
            </button>
            <button className={`${tb} ${askOpen ? "!bg-[var(--accent-soft)] !text-[var(--accent)]" : ""}`} onClick={() => { setAskOpen((o) => !o); setCommentsOpen(false); setConnectionsOpen(false); }}><Sparkles size={14} /> Ask</button>
            <button className={tb} onClick={() => setCompareOpen(true)} disabled={readyPapers.length < 2} title={readyPapers.length < 2 ? "Add at least two papers first" : "Compare papers in a table"}><Table2 size={14} /> Compare</button>
            <button className={tb} onClick={() => { setCommentsOpen((o) => !o); setAskOpen(false); setConnectionsOpen(false); }}><MessageSquare size={14} /> Comments{comments.filter((c) => !c.resolved).length > 0 && ` (${comments.filter((c) => !c.resolved).length})`}</button>
            <button className={tb} onClick={() => exportMarkdown("download")} title="Download a Markdown summary"><Download size={14} /> Export</button>
            <button className={tb} onClick={() => exportMarkdown("copy")}>Copy</button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div
            ref={wrapRef} className={`relative min-w-0 flex-1 ${view === "matrix" ? "hidden" : ""}`}
            onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
            onDrop={(e) => {
              if (!e.dataTransfer.files.length) return;
              e.preventDefault();
              uploadFiles(Array.from(e.dataTransfer.files), rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
            }}
          >
            <ReactFlow
              nodes={nodes} edges={displayEdges} nodeTypes={nodeTypes}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
              onBeforeDelete={onBeforeDelete as any} onNodesDelete={onNodesDelete}
              onNodeDragStart={snapshot} deleteKeyCode={["Backspace", "Delete"]}
              onEdgeClick={(_, edge) => { const g = ghosts.find((x) => x.id === edge.id); setGhostId(g ? g.suggestion.id : null); }}
              onPaneClick={() => setGhostId(null)}
              minZoom={0.1} maxZoom={2} colorMode={dark ? "dark" : "light"} fitView
              zoomOnDoubleClick={false}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeStrokeWidth={2}
                nodeColor={(n) => ({ paper: "#2563eb", excerpt: "#d97706", claim: "#7c3aed", note: "#eab308", frame: "#94a3b8", answer: "#16a34a", table: "#0891b2" } as Record<string, string>)[n.type ?? ""] ?? "#94a3b8"} />
            </ReactFlow>

            {/* add toolbar */}
            <div className="pointer-events-none absolute left-0 right-0 top-3 z-10 flex justify-center">
              <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-pop)]">
                <button className={tb} onClick={() => fileInput.current?.click()}><Upload size={14} /> Add papers</button>
                <button className={tb} onClick={() => setImportOpen(true)}><Library size={14} /> From my library</button>
                <span className="mx-1 h-5 w-px bg-[var(--border)]" />
                <button className={tb} onClick={() => addNode("claim", { text: "", status: "idea" })}><Target size={14} /> My research</button>
                <button className={tb} onClick={() => addNode("note", { title: "", text: "", color: "#fef3c7" })}><StickyNote size={14} /> Note</button>
                <button className={tb} onClick={() => addNode("frame", { title: "" })}><Frame size={14} /> Group</button>
              </div>
              <input ref={fileInput} type="file" accept="application/pdf" multiple hidden
                onChange={(e) => { uploadFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
            </div>

            {ghostSuggestion && (
              <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
                <SuggestionCard s={ghostSuggestion} aName={nameOf(ghostSuggestion.a_kind, ghostSuggestion.a_ref)} bName={nameOf(ghostSuggestion.b_kind, ghostSuggestion.b_ref)}
                  onAccept={() => acceptSuggestion(ghostSuggestion)} onDismiss={() => dismissSuggestion(ghostSuggestion)} onCite={openCite} onClose={() => setGhostId(null)} />
              </div>
            )}

            {selectedEdge && edgeEvidence && !ghostSuggestion && (
              <div className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2">
                <SuggestionCard s={edgeEvidence} aName={nameOf(edgeEvidence.a_kind, edgeEvidence.a_ref)} bName={nameOf(edgeEvidence.b_kind, edgeEvidence.b_ref)} onCite={openCite} />
              </div>
            )}

            {/* link inspector */}
            {selectedEdge && !ghostSuggestion && (
              <div className="anim-pop absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-pop)]">
                <span className="px-1 text-xs text-[var(--muted)]">This link:</span>
                {EDGE_KINDS.map((k) => (
                  <button key={k.id} onClick={() => { snapshot(); patchEdge(selectedEdge.id, { kind: k.id }); }}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${((selectedEdge.data as any)?.kind ?? "related") === k.id ? "border-[var(--foreground)] font-medium" : "border-[var(--border)] text-[var(--muted)]"}`}>
                    <span className="h-2 w-2 rounded-full" style={{ background: k.color }} />{k.label}
                  </button>
                ))}
                <input value={(selectedEdge.data as any)?.label ?? ""} onFocus={snapshot} onChange={(e) => patchEdge(selectedEdge.id, { label: e.target.value })}
                  placeholder="Why? (optional)" className="w-40 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs outline-none" />
                <button onClick={() => { snapshot(); setEdges((es) => es.filter((e) => e.id !== selectedEdge.id)); }} className="rounded-lg p-1.5 text-[var(--danger)] hover:bg-[var(--surface-muted)]" aria-label="Delete link"><Trash2 size={14} /></button>
              </div>
            )}

            {nodes.length === 0 && !busy && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="max-w-sm rounded-[var(--radius-panel)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)]/90 p-6 text-center">
                  <FilePlus2 size={26} className="mx-auto mb-2 text-[var(--accent)]" />
                  <p className="text-sm font-medium">Drop your PDFs here</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Add the papers you are reading, open one to save quotes and figures, then draw links between the ideas that connect. Add a “My research” card to show where your own work fits.</p>
                </div>
              </div>
            )}
            {(busy || notice) && (
              <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-lg bg-[var(--foreground)] px-3 py-2 text-xs text-[var(--background)] shadow-lg">
                {busy && <Loader2 size={13} className="animate-spin" />}{busy || notice}
              </div>
            )}
          </div>

          {view === "matrix" && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <MatrixView docs={documents} claims={claimCards.filter((c) => c.text.trim())} suggestions={agent?.suggestions ?? []}
                onAccept={acceptSuggestion} onDismiss={dismissSuggestion} onCite={openCite} />
            </div>
          )}

          {reader && readerDoc && (
            <div className="relative w-[46%] min-w-[400px] max-w-[760px] shrink-0 border-l border-[var(--border)] md:w-[var(--panel-w)] md:min-w-0 md:max-w-none" style={panelStyle(readerPanel.width)}>
              <ResizeHandle panel={readerPanel} edge="left" label="Resize the paper reader" />
              <PdfReader
                key={reader.documentId}
                fileUrl={dashboardApi.fileUrl(reader.documentId)} filename={readerDoc.filename}
                excerpts={excerpts.filter((e) => e.document_id === reader.documentId)}
                focus={reader.focus} onCreate={createExcerpt} onClose={() => setReader(null)}
              />
            </div>
          )}

          {connectionsOpen && (
            <ConnectionsPanel
              dashboardId={dashboardId} agent={agent} paperCount={readyPapers.length} claimCount={claimCards.filter((c) => c.text.trim().length >= 12).length}
              nameOf={nameOf} beforeRun={flushSave} onStarted={() => { refreshAgent(); window.setTimeout(refreshAgent, 800); }}
              onFocus={focusSuggestion} onAccept={acceptSuggestion} onDismiss={dismissSuggestion} onCite={openCite} onClose={() => setConnectionsOpen(false)}
            />
          )}

          {askOpen && (
            <AskPanel
              dashboardId={dashboardId} papers={readyPapers}
              selectedDocIds={selection.docIds} selectedExcerptIds={selection.excerptIds}
              onCite={openCite} onPin={pinAnswer} onUsageChanged={refreshUsage} onClose={() => setAskOpen(false)}
            />
          )}

          {commentsOpen && (
            <CommentsPanel
              comments={comments} label={nodeLabel} target={commentTarget} onTarget={setCommentTarget}
              panel={commentsPanel}
              onAdd={addComment} onClose={() => setCommentsOpen(false)}
              onResolve={async (c) => { const u = await dashboardApi.resolveComment(c.id, !c.resolved); setComments((x) => x.map((y) => (y.id === c.id ? u : y))); }}
              onDelete={async (c) => { await dashboardApi.deleteComment(c.id); setComments((x) => x.filter((y) => y.id !== c.id)); }}
              onJump={(id) => id && rf.fitView({ nodes: [{ id }], padding: 0.6, duration: 400, maxZoom: 1.2 })}
            />
          )}
        </div>

        {compareOpen && (
          <CompareDialog
            dashboardId={dashboardId} papers={readyPapers} preselected={selection.docIds}
            onClose={() => setCompareOpen(false)} onDone={addTable} onUsageChanged={refreshUsage}
          />
        )}
        {dialogs}
        {importOpen && <ImportDialog dashboardId={dashboardId} onClose={() => setImportOpen(false)} onImport={importFromLibrary} />}
      </div>
    </CanvasContext.Provider>
  );
}

function CommentsPanel({ comments, label, target, onTarget, onAdd, onClose, onResolve, onDelete, onJump, panel }: {
  panel: ReturnType<typeof usePanelWidth>;
  comments: CommentInfo[]; label: (id: string | null) => string; target: string | null; onTarget: (id: string | null) => void;
  onAdd: (t: string) => Promise<void>; onClose: () => void; onResolve: (c: CommentInfo) => void; onDelete: (c: CommentInfo) => void; onJump: (id: string | null) => void;
}) {
  const [text, setText] = useState("");
  const sorted = [...comments].sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.id - a.id);
  return (
    <aside style={panelStyle(panel.width)} className="relative flex w-80 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)] md:w-[var(--panel-w)]">
      <ResizeHandle panel={panel} edge="left" label="Resize the comments panel" />
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2"><span className="text-sm font-semibold">Comments</span>
        <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--surface-muted)]"><X size={15} /></button></div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {sorted.length === 0 && <p className="text-xs text-[var(--muted)]">No comments yet. Use them for reminders to yourself, or questions for a co-author.</p>}
        {sorted.map((c) => (
          <div key={c.id} className={`rounded-lg border border-[var(--border)] p-2.5 text-sm ${c.resolved ? "opacity-50" : ""}`}>
            <button onClick={() => onJump(c.node_id)} className="mb-1 block max-w-full truncate text-[11px] text-[var(--accent)] hover:underline">{label(c.node_id)}</button>
            <p className="whitespace-pre-wrap">{c.text}</p>
            <div className="mt-1.5 flex gap-3 text-[11px] text-[var(--muted)]">
              <button onClick={() => onResolve(c)} className="hover:text-[var(--foreground)]">{c.resolved ? "Reopen" : "Resolve"}</button>
              <button onClick={() => onDelete(c)} className="hover:text-[var(--danger)]">Delete</button>
            </div>
          </div>
        ))}
      </div>
      <form className="space-y-2 border-t border-[var(--border)] p-3" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; await onAdd(text); setText(""); }}>
        <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
          <span className="truncate">On: {label(target)}</span>
          {target && <button type="button" onClick={() => onTarget(null)} className="underline">Whole dashboard</button>}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Write a comment…"
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm outline-none focus:border-[var(--border-strong)]" />
        <button disabled={!text.trim()} className="w-full rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-contrast)] disabled:opacity-40">Add comment</button>
      </form>
    </aside>
  );
}

function ImportDialog({ dashboardId, onClose, onImport }: { dashboardId: string; onClose: () => void; onImport: (ids: number[]) => void }) {
  const [papers, setPapers] = useState<{ id: number; filename: string }[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  useEffect(() => { dashboardApi.library(dashboardId).then(setPapers).catch(() => setPapers([])); }, [dashboardId]);
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="anim-pop flex max-h-[80vh] w-full max-w-md flex-col rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-pop)]" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-[var(--border)] p-4"><h3 className="text-sm font-semibold">Add papers you already uploaded</h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">These come from your other chats and dashboards. Each dashboard gets its own copy.</p></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {papers === null && <p className="p-3 text-xs text-[var(--muted)]">Loading…</p>}
          {papers?.length === 0 && <p className="p-3 text-xs text-[var(--muted)]">Nothing to import yet. Upload a PDF to get started.</p>}
          {papers?.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-[var(--surface-muted)]">
              <input type="checkbox" checked={picked.has(p.id)} onChange={() => setPicked((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} />
              <span className="truncate">{p.filename}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] p-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-muted)]">Cancel</button>
          <button disabled={!picked.size} onClick={() => onImport(Array.from(picked))} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-contrast)] disabled:opacity-40">Add {picked.size || ""} {picked.size === 1 ? "paper" : "papers"}</button>
        </div>
      </div>
    </div>
  );
}
