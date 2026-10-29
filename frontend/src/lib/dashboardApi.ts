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
};
