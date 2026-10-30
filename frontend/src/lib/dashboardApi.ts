import { getConfig } from "./documentApi";
import { getAnalyzeFigures } from "./figureSettings";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

export type DocInfo = { id: number; filename: string; progress: number; status: string };
export type ExcerptInfo = {
  id: number; document_id: number; page: number; kind: "text" | "area";
  rects: number[][]; quote: string; prefix: string; suffix: string; has_image: boolean;
};
export type CommentInfo = {
  id: number; node_id: string | null; author: string; text: string; resolved: boolean; created_at: string;
};
export type DashboardSummary = { id: string; title: string; project: string; papers: number; nodes: number; updated_at: string };
export type DashboardFull = {
  id: string; title: string; project: string; session_id: string;
  nodes: any[]; edges: any[]; documents: DocInfo[]; excerpts: ExcerptInfo[]; comments: CommentInfo[];
};

export type Cite = {
  n: number; document_id: number; filename?: string | null; page?: number | null; quote: string; rects: number[][];
};
export type Usage = { tokens_in: number; tokens_out: number; calls?: number; estimated?: boolean };
export type AskResult = { answer: string; cites: Cite[]; usage: Usage; scope?: { id: number; filename: string }[] };
export type ChatMsg = { id: number; role: "user" | "assistant"; content: string; cites: Cite[] };
export type TableCell = { text: string; cites: Cite[] };
export type TableRow = { document_id: number; filename: string; cells: Record<string, TableCell> };
export type UsageTotals = { tokens_in: number; tokens_out: number; actions: number; estimated: boolean };

/** Provider, key and model from Settings, in the shape the AI endpoints expect. */
export function aiConfig() {
  const c = getConfig();
  return { provider: c.provider || "groq", api_key: c.apiKey || "", model_name: c.modelName || undefined };
}

export type Suggestion = {
  id: number; a_kind: "paper" | "claim"; a_ref: string; b_kind: "paper" | "claim"; b_ref: string;
  relation: "supports" | "contradicts" | "extends" | "method"; summary: string; confidence: number;
  status: "pending" | "accepted"; evidence: Cite[];
};
export type AgentRunInfo = {
  id: number; kind: "wire" | "gaps"; status: "running" | "done" | "failed" | "cancelled";
  total: number; done: number; found: number; tokens_in: number; tokens_out: number; message: string;
  created_at: string; finished_at: string | null;
};
export type GapFinding = {
  node_id: string; claim: string; verdict: "supported" | "partly" | "contradicted" | "not_covered";
  missing: string; search: string; supporting: Cite[]; contradicting: Cite[];
};
export type AgentState = {
  suggestions: Suggestion[]; runs: AgentRunInfo[];
  gaps: (AgentRunInfo & { result: GapFinding[] }) | null; running: AgentRunInfo | null;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).detail ?? ""; } catch { /* not json */ }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json();
}

const json = (method: string, body: unknown): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

export const dashboardApi = {
  list: () => req<DashboardSummary[]>("/dashboards"),
  create: (title: string, project: string) => req<{ id: string }>("/dashboards", json("POST", { title, project })),
  rename: (id: string, patch: { title?: string; project?: string }) => req<unknown>(`/dashboards/${id}`, json("PATCH", patch)),
  remove: (id: string) => req<unknown>(`/dashboards/${id}`, { method: "DELETE" }),
  get: (id: string) => req<DashboardFull>(`/dashboards/${id}`),
  saveCanvas: (id: string, nodes: unknown[], edges: unknown[]) => req<unknown>(`/dashboards/${id}/canvas`, json("PUT", { nodes, edges })),
  documents: (id: string) => req<DocInfo[]>(`/dashboards/${id}/documents`),
  library: (exclude: string) => req<{ id: number; filename: string }[]>(`/dashboards/library/papers?exclude=${exclude}`),
  importPapers: (id: string, ids: number[]) => req<DocInfo[]>(`/dashboards/${id}/import`, json("POST", { document_ids: ids })),
  deleteDocument: (docId: number) => req<unknown>(`/chat/documents/${docId}`, { method: "DELETE" }),
  createExcerpt: (id: string, body: { document_id: number; page: number; kind: "text" | "area"; rects: number[][]; quote?: string }) =>
    req<ExcerptInfo>(`/dashboards/${id}/excerpts`, json("POST", body)),
  deleteExcerpt: (excerptId: number) => req<unknown>(`/excerpts/${excerptId}`, { method: "DELETE" }),
  addComment: (id: string, nodeId: string | null, text: string) =>
    req<CommentInfo>(`/dashboards/${id}/comments`, json("POST", { node_id: nodeId, text })),
  resolveComment: (cid: number, resolved: boolean) => req<CommentInfo>(`/comments/${cid}?resolved=${resolved}`, { method: "PATCH" }),
  deleteComment: (cid: number) => req<unknown>(`/comments/${cid}`, { method: "DELETE" }),
  fileUrl: (docId: number) => `${API}/documents/${docId}/file`,
  excerptImageUrl: (excerptId: number) => `${API}/excerpts/${excerptId}/image`,
  exportUrl: (id: string) => `${API}/dashboards/${id}/export.md`,

  async upload(sessionId: string, files: File[]): Promise<number[]> {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    try {
      if (getAnalyzeFigures()) {
        const cfg = getConfig();
        if (cfg.apiKey) {
          form.append("analyze_figures", "true");
          form.append("provider", cfg.provider || "groq");
          form.append("api_key", cfg.apiKey);
          if (cfg.modelName) form.append("model_name", cfg.modelName);
        }
      }
    } catch { /* settings unavailable: upload without figure analysis */ }
    const res = await req<{ doc_ids: number[] }>(`/chat/upload?session_id=${sessionId}`, { method: "POST", body: form });
    return res.doc_ids;
  },

  // ---- Stage 2: grounded AI
  ask: (id: string, text: string, document_ids?: number[], excerpt_ids?: number[]) =>
    req<AskResult>(`/dashboards/${id}/ask`, json("POST", { ...aiConfig(), text, document_ids, excerpt_ids })),
  chat: (id: string) => req<ChatMsg[]>(`/dashboards/${id}/chat`),
  clearChat: (id: string) => req<unknown>(`/dashboards/${id}/chat`, { method: "DELETE" }),
  summarize: (id: string, document_id: number) =>
    req<{ summary: string; pages: number[]; usage: Usage }>(`/dashboards/${id}/summarize`, json("POST", { ...aiConfig(), document_id })),
  compareRow: (id: string, document_id: number, columns: string[]) =>
    req<TableRow & { usage: Usage }>(`/dashboards/${id}/compare-row`, json("POST", { ...aiConfig(), document_id, columns })),
  locate: (id: string, document_id: number, quote: string, page?: number | null) =>
    req<{ page: number | null; rects: number[][] }>(`/dashboards/${id}/locate`, json("POST", { document_id, quote, page })),
  estimate: (id: string, action: "ask" | "summarize" | "compare", document_ids: number[], columns = 5) => {
    const c = aiConfig();
    return req<{ tokens_in: number; tokens_out: number }>(`/dashboards/${id}/estimate`,
      json("POST", { action, document_ids, columns, provider: c.provider, model_name: c.model_name }));
  },
  usage: (id: string) => req<UsageTotals>(`/dashboards/${id}/usage`),

  // ---- Stage 3: agent wiring
  agent: (id: string) => req<AgentState>(`/dashboards/${id}/agent`),
  wireRun: (id: string, opts: { include_claims: boolean; max_pairs: number; rerun?: boolean; document_ids?: number[] }) =>
    req<{ run_id: number }>(`/dashboards/${id}/wire/run`, json("POST", { ...aiConfig(), ...opts })),
  gapsRun: (id: string) => req<{ run_id: number }>(`/dashboards/${id}/gaps/run`, json("POST", aiConfig())),
  cancelRun: (id: string, runId: number) => req<unknown>(`/dashboards/${id}/runs/${runId}/cancel`, { method: "POST" }),
  setSuggestion: (sid: number, status: "pending" | "accepted" | "dismissed") =>
    req<Suggestion>(`/wire/suggestions/${sid}`, json("PATCH", { status })),
  wireEstimate: (id: string, include_claims: boolean, max_pairs: number) =>
    req<{ calls: number; tokens_in: number; tokens_out: number; papers: number; claims: number }>(
      `/dashboards/${id}/wire/estimate`, json("POST", { include_claims, max_pairs })),
};
