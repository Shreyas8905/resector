/** Turn [3] and [p.7] markers into markdown links with our own schemes, so they can be
 *  rendered as clickable chips. Existing markdown links such as [1](http://...) are left alone. */
export function linkifyCitations(md: string): string {
  return (md || "")
    .replace(/\[p\.(\d{1,4})\](?!\()/g, "[p.$1](page:$1)")
    .replace(/\[(\d{1,3})\](?!\()/g, "[$1](cite:$1)");
}

export type CiteTarget = { kind: "cite"; n: number } | { kind: "page"; page: number } | null;

export function parseCiteHref(href?: string): CiteTarget {
  const m = /^(cite|page):(\d{1,4})$/.exec(href || "");
  if (!m) return null;
  return m[1] === "cite" ? { kind: "cite", n: Number(m[2]) } : { kind: "page", page: Number(m[2]) };
}

/** Compact token count: 1234 -> "1.2k". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 100000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n / 1000)}k`;
}
