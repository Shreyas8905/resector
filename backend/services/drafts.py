"""Pure helpers for drafts: citation markers, sentence splitting, numbering and bibliography, version
snapshots, parsing of model output, and Markdown/HTML export. No database, LangChain or PyMuPDF imports.

Citation markers inside draft text:
    [@e12]    a saved excerpt (quote with exact position)
    [@d5:p3]  page 3 of paper (document) 5
    [@d5]     paper 5, no page
"""
from __future__ import annotations

import hashlib
import html
import re
from typing import Any, Callable, Dict, List, Optional, Tuple

from .grounding import extract_json_object, normalize_citations

MARKER_RE = re.compile(r"\[@(e\d+|d\d+(?::p\d+)?)\]")
MAX_CHECK_ITEMS = 24
MAX_SECTIONS = 12


# ---------------------------------------------------------------- markers
def excerpt_marker(excerpt_id: int) -> str:
    return f"[@e{int(excerpt_id)}]"


def doc_marker(document_id: int, page: Optional[int] = None) -> str:
    return f"[@d{int(document_id)}:p{int(page)}]" if page else f"[@d{int(document_id)}]"


def parse_key(key: str) -> Optional[Dict[str, Any]]:
    """'e12' / 'd5:p3' / 'd5' -> {"kind", "id", "page"} or None."""
    m = re.fullmatch(r"(e|d)(\d+)(?::p(\d+))?", key or "")
    if not m:
        return None
    if m.group(1) == "e":
        return {"kind": "excerpt", "id": int(m.group(2)), "page": None}
    return {"kind": "doc", "id": int(m.group(2)), "page": int(m.group(3)) if m.group(3) else None}


def find_markers(text: str) -> List[Dict[str, Any]]:
    return [{"start": m.start(), "end": m.end(), "key": m.group(1)} for m in MARKER_RE.finditer(text or "")]


def strip_markers(text: str) -> str:
    return re.sub(r"[ \t]{2,}", " ", MARKER_RE.sub("", text or ""))


def content_hash(text: str) -> str:
    return hashlib.sha1((text or "").encode("utf-8")).hexdigest()[:16]


def word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'’-]+\b", strip_markers(text)))


def marker_for_passage(p: Dict[str, Any]) -> str:
    """Marker for a numbered passage: a saved excerpt keeps its exact position; anything else cites the page."""
    if p.get("excerpt_id"):
        return excerpt_marker(p["excerpt_id"])
    return doc_marker(p["document_id"], p.get("page"))


def to_markers(text: str, included: List[Dict[str, Any]]) -> Tuple[str, List[str]]:
    """Replace [n] in model output with draft markers. Numbers that point at nothing are dropped.
    Returns (text, markers in order of first use)."""
    by_n = {p["n"]: p for p in included}
    cleaned, _ = normalize_citations(text, set(by_n))
    used: List[str] = []

    def repl(m: re.Match) -> str:
        n = int(m.group(1))
        mk = marker_for_passage(by_n[n])
        if mk not in used:
            used.append(mk)
        return mk

    out = re.sub(r"\[(\d{1,3})\]", repl, cleaned)
    out = re.sub(r"\[p\.\d{1,4}\]", "", out)             # page cites without a paper are meaningless in a draft
    return out.strip(), used


# ---------------------------------------------------------------- numbering and bibliography
def number_citations(text: str, resolve: Callable[[str], Optional[Dict[str, Any]]]) -> Tuple[str, List[Dict[str, Any]], List[str]]:
    """Turn markers into [1], [2], ... in order of first use. Consecutive markers become [1][2].
    `resolve(key)` returns {"filename", "page", "quote", ...} or None for a source that no longer exists.
    Unresolvable markers are removed and listed in `missing`. Returns (text, sources, missing)."""
    order: Dict[str, int] = {}
    sources: List[Dict[str, Any]] = []
    missing: List[str] = []

    def repl(m: re.Match) -> str:
        key = m.group(1)
        if key not in order:
            src = resolve(key)
            if not src:
                if key not in missing:
                    missing.append(key)
                return ""
            order[key] = len(sources) + 1
            sources.append({**src, "n": order[key], "key": key})
        return f"[{order[key]}]"

    return MARKER_RE.sub(repl, text or ""), sources, missing


def reference_line(src: Dict[str, Any], quote_chars: int = 200) -> str:
    where = f", p.{src['page']}" if src.get("page") else ""
    line = f"{src.get('filename') or 'Paper'}{where}"
    q = re.sub(r"\s+", " ", src.get("quote") or "").strip()
    if q:
        q = q if len(q) <= quote_chars else q[:quote_chars].rsplit(" ", 1)[0] + "…"
        line += f' — "{q}"'
    return line


def build_markdown(title: str, content: str, resolve: Callable[[str], Optional[Dict[str, Any]]],
                   include_quotes: bool = True) -> Tuple[str, List[str]]:
    body, sources, missing = number_citations(content, resolve)
    out = body.rstrip() + "\n"
    if sources:
        out += "\n## References\n\n"
        for s in sources:
            ref = reference_line(s) if include_quotes else reference_line({**s, "quote": ""})
            out += f"{s['n']}. {ref}\n"
    if not re.match(r"\s*#\s", body):                      # add the title unless the text starts with its own
        out = f"# {title}\n\n" + out
    return out, missing


# ---------------------------------------------------------------- tiny Markdown -> HTML (export only)
def _inline(s: str) -> str:
    s = html.escape(s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\*\w])\*([^*\n]+)\*(?![\*\w])", r"<em>\1</em>", s)
    s = re.sub(r"(?<![\w])_([^_\n]+)_(?![\w])", r"<em>\1</em>", s)
    s = re.sub(r"\[(\d{1,3})\]", r'<a class="cite" href="#ref-\1">[\1]</a>', s)
    return s


def md_to_html(md: str) -> str:
    out: List[str] = []
    para: List[str] = []
    lst: Optional[str] = None

    def flush_para():
        if para:
            out.append("<p>" + _inline(" ".join(x.strip() for x in para)) + "</p>")
            para.clear()

    def close_list():
        nonlocal lst
        if lst:
            out.append(f"</{lst}>")
            lst = None

    for line in (md or "").splitlines():
        if not line.strip():
            flush_para(); close_list(); continue
        h = re.match(r"^(#{1,6})\s+(.*)$", line)
        if h:
            flush_para(); close_list()
            lvl = len(h.group(1))
            out.append(f"<h{lvl}>{_inline(h.group(2).strip())}</h{lvl}>")
            continue
        ul = re.match(r"^\s*[-*+]\s+(.*)$", line)
        ol = re.match(r"^\s*(\d+)[.)]\s+(.*)$", line)
        if ul or ol:
            flush_para()
            tag = "ul" if ul else "ol"
            if lst != tag:
                close_list()
                out.append(f"<{tag}>")
                lst = tag
            if ol:
                out.append(f'<li id="ref-{ol.group(1)}">{_inline(ol.group(2))}</li>' if False else f"<li>{_inline(ol.group(2))}</li>")
            else:
                out.append(f"<li>{_inline(ul.group(1))}</li>")
            continue
        q = re.match(r"^\s*>\s?(.*)$", line)
        if q:
            flush_para(); close_list()
            out.append(f"<blockquote>{_inline(q.group(1))}</blockquote>")
            continue
        close_list()
        para.append(line)
    flush_para(); close_list()
    return "\n".join(out)


HTML_PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{title}</title>
<style>
body{{font-family:Georgia,'Times New Roman',serif;max-width:46rem;margin:2.5rem auto;padding:0 1rem;line-height:1.6;color:#1a1a1a}}
h1,h2,h3{{line-height:1.25}} h1{{font-size:1.8rem}} h2{{margin-top:2rem}}
a.cite{{text-decoration:none;color:#2563eb;font-size:.85em;vertical-align:super}}
blockquote{{margin:1rem 0;padding-left:1rem;border-left:3px solid #ccc;color:#444}}
ol.refs li{{font-size:.9rem;margin:.35rem 0}}
@media print{{body{{margin:0;max-width:none}}a.cite{{color:#000}}}}
</style></head><body>
{body}
</body></html>
"""


def build_html(title: str, content: str, resolve: Callable[[str], Optional[Dict[str, Any]]],
               include_quotes: bool = True) -> Tuple[str, List[str]]:
    body, sources, missing = number_citations(content, resolve)
    parts = [md_to_html(body)]
    if not re.match(r"\s*#\s", body):
        parts.insert(0, f"<h1>{html.escape(title)}</h1>")
    if sources:
        refs = "".join(
            f'<li id="ref-{s["n"]}">{html.escape(reference_line(s) if include_quotes else reference_line({**s, "quote": ""}))}</li>'
            for s in sources)
        parts.append(f'<h2>References</h2>\n<ol class="refs">{refs}</ol>')
    return HTML_PAGE.format(title=html.escape(title), body="\n".join(parts)), missing


# ---------------------------------------------------------------- sentences (for the draft checker)
_ABBREV = {"al", "e.g", "i.e", "fig", "figs", "eq", "eqs", "vs", "cf", "etc", "approx", "dr", "mr", "mrs", "ms", "no",
           "sec", "ref", "refs", "tab", "ca", "resp", "inc", "ltd", "st", "prof"}
_BOUNDARY = re.compile(r"[.!?][\"')\]]*(?:\[@[^\]\s]+\])*(?=\s|$)")
_LIST_PREFIX = re.compile(r"^(\s*(?:[-*+]|\d+[.)])\s+)")
_CLAIMY = re.compile(
    r"\b(found|find|finds|show|shows|showed|shown|demonstrat\w*|report\w*|achiev\w*|outperform\w*|improv\w*|"
    r"increas\w*|decreas\w*|reduc\w*|signific\w*|correlat\w*|associat\w*|evidence|studies|study|research|"
    r"literature|prior work|previous work|et al|accuracy|effective\w*|cause[sd]?|lead[s]? to|result(?:s|ed)? in|"
    r"percent|prevalen\w*|rate of)\b", re.I)
_OWN_VOICE = re.compile(r"^(we|i|our|my|this (?:paper|study|section|work|chapter|article)|in this|here,? we|below|above|"
                        r"the (?:following|next) section|first|second|third|finally|in summary|to summari[sz]e)\b", re.I)


def _is_abbrev(before: str) -> bool:
    m = re.search(r"([A-Za-z.]+)$", before.rstrip(".!?"))
    if not m:
        return False
    w = m.group(1).lower().strip(".")
    return w in _ABBREV or (len(w) == 1 and w.isalpha())


def _split_line(line: str, base: int) -> List[Tuple[int, int]]:
    spans: List[Tuple[int, int]] = []
    start = 0
    for m in _BOUNDARY.finditer(line):
        if _is_abbrev(line[start:m.start() + 1]):
            continue
        end = m.end()
        if line[start:end].strip():
            spans.append((base + start, base + end))
        start = end
    if line[start:].strip():
        spans.append((base + start, base + len(line)))
    return spans


def split_sentences(content: str) -> List[Dict[str, Any]]:
    """Sentences of the prose in a draft, with their citation markers. Headings, code, tables and
    blank lines are skipped. `raw` is exactly the slice of `content` (markers included), so a
    citation can be added by replacing `raw` with `raw + marker`."""
    out: List[Dict[str, Any]] = []
    heading = ""
    in_code = False
    pos = 0
    for line in (content or "").split("\n"):
        line_start = pos
        pos += len(line) + 1
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code = not in_code
            continue
        if in_code or not stripped:
            continue
        h = re.match(r"^#{1,6}\s+(.*)$", stripped)
        if h:
            heading = h.group(1).strip()
            continue
        if stripped.startswith("|") or stripped.startswith(">") or re.fullmatch(r"[-*_]{3,}", stripped):
            continue
        body_off = 0
        lp = _LIST_PREFIX.match(line)
        if lp:
            body_off = len(lp.group(1))
        for s, e in _split_line(line[body_off:], line_start + body_off):
            raw = content[s:e]
            lead = len(raw) - len(raw.lstrip())
            raw_t = raw.strip()
            text = re.sub(r"\s+", " ", strip_markers(raw_t)).strip()
            if not text:
                continue
            out.append({"idx": len(out), "start": s + lead, "end": s + lead + len(raw_t), "raw": raw_t,
                        "text": text, "keys": [m["key"] for m in find_markers(raw_t)], "section": heading})
    return out


def is_claim_like(text: str) -> bool:
    t = (text or "").strip()
    if len(t.split()) < 8 or t.endswith("?") or _OWN_VOICE.match(t):
        return False
    return bool(re.search(r"\d", t) or _CLAIMY.search(t))


def plan_check(sentences: List[Dict[str, Any]], max_items: int = MAX_CHECK_ITEMS) -> Tuple[List[Dict[str, Any]], int]:
    """Which sentences to check: cited ones first, then uncited sentences that read like factual claims.
    Returns (items in document order, number skipped because of the cap)."""
    cited = [s for s in sentences if s["keys"]]
    uncited = [s for s in sentences if not s["keys"] and is_claim_like(s["text"])]
    chosen = (cited + uncited)[:max_items]
    skipped = len(cited) + len(uncited) - len(chosen)
    return sorted(chosen, key=lambda s: s["idx"]), max(0, skipped)


VERDICTS = ("supported", "partial", "unsupported", "contradicted")
_VERDICT_ALIASES = {
    "supported": "supported", "support": "supported", "yes": "supported", "fully supported": "supported",
    "partial": "partial", "partially": "partial", "partly": "partial", "partially supported": "partial", "weak": "partial",
    "unsupported": "unsupported", "not supported": "unsupported", "not_supported": "unsupported", "no": "unsupported",
    "not covered": "unsupported", "not_covered": "unsupported", "unclear": "unsupported",
    "contradicted": "contradicted", "contradicts": "contradicted", "contradiction": "contradicted",
}


def parse_check(raw: str, ids: List[int], max_source: Dict[int, int]) -> Dict[int, Dict[str, Any]]:
    """{id: {"verdict", "reason", "source"}} for ids the model answered about. `max_source[id]` is the
    number of sources shown for that item; a source choice outside 1..that is dropped."""
    obj = extract_json_object(raw) or {}
    items = obj.get("items") if isinstance(obj.get("items"), list) else []
    out: Dict[int, Dict[str, Any]] = {}
    for it in items:
        if not isinstance(it, dict):
            continue
        try:
            i = int(it.get("id"))
        except (TypeError, ValueError):
            continue
        if i not in ids or i in out:
            continue
        verdict = _VERDICT_ALIASES.get(str(it.get("verdict", "")).strip().lower())
        if not verdict:
            continue
        src = it.get("source")
        try:
            src = int(src) if src not in (None, "", "none") else None
        except (TypeError, ValueError):
            src = None
        if src is not None and not 1 <= src <= max_source.get(i, 0):
            src = None
        out[i] = {"verdict": verdict, "reason": re.sub(r"\s+", " ", str(it.get("reason") or "")).strip()[:260], "source": src}
    return out


def best_window(text: str, query: str, size: int = 900) -> str:
    """The stretch of `text` (a page) that shares the most words with `query`."""
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= size:
        return text
    words = {w for w in re.findall(r"[a-z0-9]{4,}", (query or "").lower())}
    if not words:
        return text[:size]
    best, best_at, step = -1, 0, max(100, size // 6)
    for at in range(0, len(text) - size + step, step):
        chunk = text[at:at + size].lower()
        score = sum(1 for w in words if w in chunk)
        if score > best:
            best, best_at = score, at
    start = text.rfind(" ", 0, best_at) + 1 if best_at else 0
    return text[start:start + size]


def overlap_score(a: str, b: str) -> float:
    wa = {w for w in re.findall(r"[a-z0-9]{4,}", (a or "").lower())}
    wb = {w for w in re.findall(r"[a-z0-9]{4,}", (b or "").lower())}
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / (len(wa) ** 0.5 * len(wb) ** 0.5)


# ---------------------------------------------------------------- autopilot parsing
def parse_outline(raw: str) -> List[Dict[str, str]]:
    obj = extract_json_object(raw) or {}
    secs = obj.get("sections") if isinstance(obj.get("sections"), list) else []
    out: List[Dict[str, str]] = []
    for s in secs:
        if isinstance(s, str):
            s = {"heading": s}
        if not isinstance(s, dict):
            continue
        heading = re.sub(r"\s+", " ", str(s.get("heading") or s.get("title") or "")).strip().lstrip("#").strip()[:120]
        if not heading:
            continue
        goal = re.sub(r"\s+", " ", str(s.get("goal") or s.get("summary") or s.get("description") or "")).strip()[:300]
        out.append({"heading": heading, "goal": goal})
    return out[:MAX_SECTIONS]


# ---------------------------------------------------------------- versions
def change_size(a: str, b: str) -> int:
    """Rough number of characters that differ between two texts (common head and tail removed)."""
    a, b = a or "", b or ""
    n = min(len(a), len(b))
    p = 0
    while p < n and a[p] == b[p]:
        p += 1
    s = 0
    while s < n - p and a[len(a) - 1 - s] == b[len(b) - 1 - s]:
        s += 1
    return max(len(a) - p - s, len(b) - p - s)


def should_auto_snapshot(old_content: str, new_content: str, seconds_since_last_version: float,
                         min_gap_s: float = 600, min_change: int = 40) -> bool:
    """Keep the state before an edit when there has been no snapshot for a while and the edit is real."""
    if not (old_content or "").strip():
        return False
    return seconds_since_last_version >= min_gap_s and change_size(old_content, new_content) >= min_change


def versions_to_prune(versions: List[Dict[str, Any]], keep: int = 60) -> List[int]:
    """Ids to delete so at most `keep` remain. Oldest automatic versions go first; manual,
    autopilot and restore points are only removed when nothing automatic is left."""
    if len(versions) <= keep:
        return []
    ordered = sorted(versions, key=lambda v: v["id"])
    excess = len(versions) - keep
    autos = [v["id"] for v in ordered if v.get("kind") == "auto"]
    others = [v["id"] for v in ordered if v.get("kind") != "auto"]
    return (autos + others)[:excess]
