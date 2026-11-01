/** Draft helpers (pure, no React): citation markers, numbering, inserting citations, line diff.
 *  Markers inside draft text: [@e12] saved excerpt, [@d5:p3] page 3 of paper 5, [@d5] paper 5. */

export const MARKER_RE = /\[@(e\d+|d\d+(?::p\d+)?)\]/g;

export type SourceInfo = {
  key: string; kind: "excerpt" | "doc"; document_id: number; filename: string;
  page: number | null; quote: string; rects: number[][]; excerpt_id?: number;
};
export type DocLike = { id: number; filename: string };
export type ExcerptLike = { id: number; document_id: number; page: number; quote: string; rects: number[][] };

export const excerptMarker = (id: number) => `[@e${id}]`;
export const docMarker = (docId: number, page?: number | null) => (page ? `[@d${docId}:p${page}]` : `[@d${docId}]`);

export function keyOfMarker(marker: string): string | null {
  const m = /^\[@(e\d+|d\d+(?::p\d+)?)\]$/.exec(marker);
  return m ? m[1] : null;
}

/** What a marker key points at, using the dashboard's papers and saved excerpts. Null if it no longer exists. */
export function resolveKey(key: string, docs: DocLike[], excerpts: ExcerptLike[]): SourceInfo | null {
  const m = /^(e|d)(\d+)(?::p(\d+))?$/.exec(key);
  if (!m) return null;
  const id = Number(m[2]);
  if (m[1] === "e") {
    const ex = excerpts.find((e) => e.id === id);
    const d = ex && docs.find((x) => x.id === ex.document_id);
    if (!ex || !d) return null;
    return { key, kind: "excerpt", document_id: d.id, filename: d.filename, page: ex.page, quote: ex.quote || "", rects: ex.rects || [], excerpt_id: ex.id };
  }
  const d = docs.find((x) => x.id === id);
  if (!d) return null;
  return { key, kind: "doc", document_id: d.id, filename: d.filename, page: m[3] ? Number(m[3]) : null, quote: "", rects: [] };
}

/** Markers -> [1], [2] in order of first use, the same numbering the exports use. */
export function numberMarkers(content: string, docs: DocLike[], excerpts: ExcerptLike[]): { text: string; sources: (SourceInfo & { n: number })[]; missing: string[] } {
  const order = new Map<string, number>();
  const sources: (SourceInfo & { n: number })[] = [];
  const missing: string[] = [];
  const text = (content || "").replace(MARKER_RE, (_all, key: string) => {
    if (!order.has(key)) {
      const s = resolveKey(key, docs, excerpts);
      if (!s) { if (!missing.includes(key)) missing.push(key); return ""; }
      order.set(key, sources.length + 1);
      sources.push({ ...s, n: sources.length + 1 });
    }
    return `[${order.get(key)}]`;
  });
  return { text, sources, missing };
}

/** Ask-panel answer ([1] [2] with their Cite records) -> draft text with markers. Unknown numbers are dropped. */
export function citesToMarkers(text: string, cites: { n: number; document_id: number; page?: number | null }[]): string {
  const by = new Map(cites.map((c) => [c.n, c]));
  return (text || "")
    .replace(/\[(\d{1,3})\]/g, (_a, n: string) => {
      const c = by.get(Number(n));
      return c ? docMarker(c.document_id, c.page ?? null) : "";
    })
    .replace(/\[p\.\d{1,4}\]/g, "")
    .replace(/(\[@[^\]]+\])(?=\1)/g, "");
}

export function insertAt(content: string, pos: number, text: string): { content: string; caret: number } {
  const p = Math.max(0, Math.min(pos, content.length));
  return { content: content.slice(0, p) + text + content.slice(p), caret: p + text.length };
}

/** Put a citation marker at the end of a sentence (`raw` is the sentence exactly as found in the draft). */
export function addCitationAfter(content: string, raw: string, marker: string): string | null {
  const i = content.indexOf(raw);
  if (i < 0 || !raw) return null;
  const end = i + raw.length;
  return content.slice(0, end) + marker + content.slice(end);
}

/** Text to look sources up for: the selection, or else the sentence around the caret. */
export function textForSuggestion(content: string, selStart: number, selEnd: number): string {
  const clean = (s: string) => s.replace(MARKER_RE, "").replace(/\s+/g, " ").trim();
  if (selEnd > selStart) return clean(content.slice(selStart, selEnd));
  const lineStart = content.lastIndexOf("\n", Math.max(0, selStart - 1)) + 1;
  let lineEnd = content.indexOf("\n", selStart);
  if (lineEnd < 0) lineEnd = content.length;
  const line = content.slice(lineStart, lineEnd);
  const at = selStart - lineStart;
  let start = 0, end = line.length;
  const re = /[.!?](?:\[@[^\]]+\])*(?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const stop = m.index + m[0].length;
    if (stop < at) start = stop; else { end = stop; break; }
  }
  return clean(line.slice(start, end).replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/^#{1,6}\s+/, ""));
}

export type DiffOp = { type: "same" | "add" | "del"; text: string };

/** Line-level diff (old -> new) by longest common subsequence. Fine for documents of a few thousand lines. */
export function diffLines(a: string, b: string): DiffOp[] {
  const x = a.split("\n"), y = b.split("\n");
  const n = x.length, m = y.length;
  if (n * m > 4_000_000) {                       // too large for the table: show a coarse replace
    return [...x.map((t) => ({ type: "del" as const, text: t })), ...y.map((t) => ({ type: "add" as const, text: t }))];
  }
  const L: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push({ type: "same", text: x[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ type: "del", text: x[i++] });
    else out.push({ type: "add", text: y[j++] });
  }
  while (i < n) out.push({ type: "del", text: x[i++] });
  while (j < m) out.push({ type: "add", text: y[j++] });
  return out;
}

export function diffSummary(ops: DiffOp[]): { added: number; removed: number } {
  return { added: ops.filter((o) => o.type === "add").length, removed: ops.filter((o) => o.type === "del").length };
}

export function wordCount(text: string): number {
  return ((text || "").replace(MARKER_RE, "").match(/[\p{L}\p{N}'’-]+/gu) || []).length;
}

/** Heading for a section the autopilot writes, followed by its text. */
export function sectionBlock(heading: string, body: string): string {
  return `## ${heading.trim()}\n\n${body.trim()}\n`;
}

/** Join blocks onto existing text with one blank line between them. */
export function appendBlock(content: string, block: string): string {
  const base = (content || "").replace(/\s+$/, "");
  return (base ? base + "\n\n" : "") + block.replace(/^\s+/, "");
}
