import { createContext, useContext } from "react";
import type { Cite, DocInfo, ExcerptInfo } from "@/lib/dashboardApi";

export type CanvasCtx = {
  docs: Map<number, DocInfo>;
  excerpts: Map<number, ExcerptInfo>;
  commentCounts: Map<string, number>;
  searchHits: Set<string> | null;           // null = no active search
  openReader: (documentId: number, excerptId?: number) => void;
  /** Call before a text edit starts changing state so undo can restore the old value. */
  snapshot: () => void;
  update: (nodeId: string, patch: Record<string, unknown>) => void;
  comment: (nodeId: string) => void;
  /** Open the reader at a cited passage (finds its exact position if needed). */
  openCite: (c: Cite) => void;
  openPage: (documentId: number, page: number) => void;
  summarize: (nodeId: string) => void;
  summarizing: Set<string>;
};

export const CanvasContext = createContext<CanvasCtx | null>(null);
export const useCanvas = () => {
  const c = useContext(CanvasContext);
  if (!c) throw new Error("CanvasContext missing");
  return c;
};

export const EDGE_KINDS: { id: string; label: string; color: string }[] = [
  { id: "related", label: "Related", color: "#94a3b8" },
  { id: "supports", label: "Supports", color: "#16a34a" },
  { id: "contradicts", label: "Contradicts", color: "#dc2626" },
  { id: "extends", label: "Builds on", color: "#2563eb" },
  { id: "method", label: "Same method", color: "#9333ea" },
  { id: "cites", label: "Cites", color: "#d97706" },
  { id: "custom", label: "Custom", color: "#0891b2" },
];
