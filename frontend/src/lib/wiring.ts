import type { Suggestion } from "./dashboardApi";

type NodeLike = { id: string; type?: string; data?: unknown };
export type EdgeLike = { id: string; source: string; target: string; data?: unknown };

export const RELATION_LABEL: Record<string, string> = {
  supports: "Supports", contradicts: "Contradicts", extends: "Builds on", method: "Same method",
};

/** Canvas node a suggestion endpoint refers to (a paper by document id, a claim by node id). */
export function nodeFor(nodes: NodeLike[], kind: string, ref: string): NodeLike | undefined {
  return nodes.find((n) =>
    kind === "claim" ? n.type === "claim" && n.id === ref
      : n.type === "paper" && String((n.data as { document_id?: number })?.document_id) === ref);
}

export type Ghost = { id: string; source: string; target: string; suggestion: Suggestion };

/** Pending suggestions as dashed "ghost" links. A suggestion whose cards are not on the canvas is skipped,
 *  and so is one that already has a real link between the same two cards. */
export function ghostLinks(suggestions: Suggestion[], nodes: NodeLike[], edges: EdgeLike[]): Ghost[] {
  const linked = new Set(edges.flatMap((e) => [`${e.source}|${e.target}`, `${e.target}|${e.source}`]));
  const out: Ghost[] = [];
  for (const s of suggestions) {
    if (s.status !== "pending") continue;
    const a = nodeFor(nodes, s.a_kind, s.a_ref), b = nodeFor(nodes, s.b_kind, s.b_ref);
    if (!a || !b || linked.has(`${a.id}|${b.id}`)) continue;
    out.push({ id: `ghost_${s.id}`, source: a.id, target: b.id, suggestion: s });
  }
  return out;
}

/** The edge to create when a suggestion is accepted. */
export function edgeFromSuggestion(s: Suggestion, nodes: NodeLike[]) {
  const a = nodeFor(nodes, s.a_kind, s.a_ref), b = nodeFor(nodes, s.b_kind, s.b_ref);
  if (!a || !b) return null;
  return { source: a.id, target: b.id, data: { kind: s.relation, label: s.summary.slice(0, 120) } };
}

/** The accepted suggestion behind a real link, if the link came from the agent (matched by its two cards). */
export function suggestionForEdge(edge: EdgeLike, suggestions: Suggestion[], nodes: NodeLike[]): Suggestion | undefined {
  return suggestions.find((s) => {
    if (s.status !== "accepted") return false;
    const a = nodeFor(nodes, s.a_kind, s.a_ref), b = nodeFor(nodes, s.b_kind, s.b_ref);
    return !!a && !!b && ((edge.source === a.id && edge.target === b.id) || (edge.source === b.id && edge.target === a.id));
  });
}

export type MatrixCell = { suggestion: Suggestion; count: number };

/** rows: claims then papers; columns: papers. Paper-paper links appear on both sides of the diagonal. */
export function buildMatrix(paperIds: number[], claimIds: string[], suggestions: Suggestion[]) {
  const cells = new Map<string, MatrixCell>();
  const put = (r: string, c: string, s: Suggestion) => {
    const k = `${r}|${c}`, cur = cells.get(k);
    if (!cur) cells.set(k, { suggestion: s, count: 1 });
    else cells.set(k, { suggestion: cur.suggestion.confidence >= s.confidence ? cur.suggestion : s, count: cur.count + 1 });
  };
  for (const s of suggestions) {
    if (s.a_kind === "paper" && s.b_kind === "paper") { put(`paper:${s.a_ref}`, s.b_ref, s); put(`paper:${s.b_ref}`, s.a_ref, s); }
    else if (s.a_kind === "claim" && s.b_kind === "paper") put(`claim:${s.a_ref}`, s.b_ref, s);
  }
  const rows = [...claimIds.map((id) => `claim:${id}`), ...paperIds.map((id) => `paper:${id}`)];
  return { rows, cols: paperIds.map(String), cells };
}

export const VERDICT_LABEL: Record<string, string> = {
  supported: "Supported", partly: "Partly supported", contradicted: "Contradicted", not_covered: "Not covered by your papers",
};
