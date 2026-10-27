export type Rect = [number, number, number, number]; // x0,y0,x1,y1 as fractions of the page

/** Merge the many per-span rectangles of a text selection into one rectangle per line. */
export function mergeLineRects(rects: Rect[], gap = 0.012): Rect[] {
  const sorted = [...rects].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const out: Rect[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last) {
      const overlap = Math.min(last[3], r[3]) - Math.max(last[1], r[1]);
      const minH = Math.min(last[3] - last[1], r[3] - r[1]);
      if (minH > 0 && overlap / minH > 0.6 && r[0] - last[2] <= gap) {
        last[0] = Math.min(last[0], r[0]);
        last[1] = Math.min(last[1], r[1]);
        last[2] = Math.max(last[2], r[2]);
        last[3] = Math.max(last[3], r[3]);
        continue;
      }
    }
    out.push([...r] as Rect);
  }
  return out;
}

/** Client-space DOMRects -> fractions of `page`, clamped to it, tiny slivers dropped. */
export function toPageFractions(client: { left: number; top: number; right: number; bottom: number }[], page: DOMRect): Rect[] {
  const w = page.width, h = page.height;
  if (!w || !h) return [];
  const out: Rect[] = [];
  for (const c of client) {
    const x0 = Math.min(1, Math.max(0, (c.left - page.left) / w));
    const x1 = Math.min(1, Math.max(0, (c.right - page.left) / w));
    const y0 = Math.min(1, Math.max(0, (c.top - page.top) / h));
    const y1 = Math.min(1, Math.max(0, (c.bottom - page.top) / h));
    if (x1 - x0 < 0.002 || y1 - y0 < 0.002) continue;
    out.push([x0, y0, x1, y1]);
  }
  return out;
}
