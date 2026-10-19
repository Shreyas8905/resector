"""Pure-Python helpers for the figure pipeline (no PyMuPDF, no network).

Everything here works on plain (x0, y0, x1, y1) tuples so it can be unit-tested
without a PDF.
"""
from __future__ import annotations

import json
import re
from typing import Iterable, Optional, Sequence

Rect = tuple  # (x0, y0, x1, y1)

# ---------------------------------------------------------------- captions
_CAPTION_RE = re.compile(
    r"^\s*(?:Figure|Fig\.?|FIGURE|FIG\.?)\s*(?P<num>\d+|[IVXL]+)\s*(?P<sep>[.:|\-–—])?\s*(?P<rest>.*)$",
    re.S,
)


def parse_caption(text: str) -> Optional[tuple]:
    """Return (label, caption_text) if `text` starts like a figure caption.

    "Figure 3: Accuracy vs. size"  -> ("Figure 3", "Accuracy vs. size")
    "Figure 3 shows that ..."      -> None (an in-text reference, not a caption)
    """
    m = _CAPTION_RE.match(text or "")
    if not m:
        return None
    rest = (m.group("rest") or "").strip()
    if not m.group("sep") and not (rest[:1].isupper()):
        return None
    label = f"Figure {m.group('num').upper()}"
    caption = re.sub(r"\s+", " ", rest).strip()
    return label, caption


# ------------------------------------------------------------------ rects
def width(r: Rect) -> float:
    return max(0.0, r[2] - r[0])


def height(r: Rect) -> float:
    return max(0.0, r[3] - r[1])


def area(r: Rect) -> float:
    return width(r) * height(r)


def union(rects: Iterable[Rect]) -> Optional[Rect]:
    rects = list(rects)
    if not rects:
        return None
    return (
        min(r[0] for r in rects), min(r[1] for r in rects),
        max(r[2] for r in rects), max(r[3] for r in rects),
    )


def inflate(r: Rect, d: float) -> Rect:
    return (r[0] - d, r[1] - d, r[2] + d, r[3] + d)


def intersects(a: Rect, b: Rect) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def x_overlap(a: Rect, b: Rect) -> float:
    return max(0.0, min(a[2], b[2]) - max(a[0], b[0]))


def merge_clusters(rects: Sequence[Rect], gap: float = 12.0) -> list:
    """Repeatedly merge rects that touch once inflated by gap/2."""
    clusters = [tuple(r) for r in rects]
    changed = True
    while changed:
        changed = False
        out: list = []
        for r in clusters:
            for i, c in enumerate(out):
                if intersects(inflate(r, gap / 2), inflate(c, gap / 2)):
                    out[i] = union([c, r])
                    changed = True
                    break
            else:
                out.append(r)
        clusters = out
    return clusters


def column_span(caption: Rect, page_width: float) -> tuple:
    """x-range of the column a caption belongs to (full width if it spans most of the page)."""
    if width(caption) >= 0.6 * page_width:
        return 0.0, page_width
    mid = page_width / 2
    cx = (caption[0] + caption[2]) / 2
    return (0.0, mid + 4) if cx < mid else (mid - 4, page_width)


# --------------------------------------------------------- figure location
MIN_W, MIN_H = 40.0, 24.0


def _usable_graphics(graphics: Sequence[Rect], page: Rect) -> list:
    page_area = area(page)
    keep = []
    for g in graphics:
        w, h = width(g), height(g)
        if w < 0.5 and h < 0.5:
            continue
        if min(w, h) < 1.5 and max(w, h) > 150:      # horizontal/vertical rules
            continue
        if area(g) > 0.9 * page_area:                 # page background
            continue
        keep.append(g)
    return keep


def locate_figure_region(
    caption: Rect,
    graphics: Sequence[Rect],
    text_blocks: Sequence[Rect],
    page: Rect,
    other_captions: Sequence[Rect] = (),
    max_gap: float = 90.0,
) -> Optional[Rect]:
    """Find the picture that belongs to `caption`.

    Looks above the caption first (the usual place), then below it. Graphics are
    clustered; the nearest cluster inside the caption's column wins. Small text
    blocks that sit inside/next to the cluster (axis labels, legends, node
    labels) are pulled in. Returns None when nothing plausible is found.
    """
    gs = _usable_graphics(graphics, page)
    x0, x1 = column_span(caption, page[2] - page[0])

    def in_col(g: Rect) -> bool:
        return x_overlap(g, (x0, 0, x1, 1)) >= 0.5 * max(width(g), 1.0)

    # other captions in the same column bound the search
    same_col = [c for c in other_captions if c != caption and x_overlap(c, (x0, 0, x1, 1)) > 0]
    above_bound = max([c[3] for c in same_col if c[3] <= caption[1]] or [page[1]])
    below_bound = min([c[1] for c in same_col if c[1] >= caption[3]] or [page[3]])

    def pick(direction: str) -> Optional[Rect]:
        if direction == "above":
            cand = [g for g in gs if in_col(g) and g[3] <= caption[1] + 3 and g[1] >= above_bound - 2]
        else:
            cand = [g for g in gs if in_col(g) and g[1] >= caption[3] - 3 and g[3] <= below_bound + 2]
        clusters = [c for c in merge_clusters(cand) if width(c) >= MIN_W and height(c) >= MIN_H]
        if not clusters:
            return None
        if direction == "above":
            best = max(clusters, key=lambda c: c[3])
            dist = caption[1] - best[3]
        else:
            best = min(clusters, key=lambda c: c[1])
            dist = best[1] - caption[3]
        return best if dist <= max_gap else None

    region = pick("above") or pick("below")
    if region is None:
        return None

    # pull in labels / legends around the graphic
    probe = inflate(region, 14)
    extras = [
        t for t in text_blocks
        if intersects(t, probe) and t != caption and area(t) < 0.25 * area(page)
        and t[1] >= above_bound - 2 and t[3] <= below_bound + 2
    ]
    region = union([region] + extras)
    # add a little breathing room, stay inside the page and above/below the caption itself
    region = inflate(region, 4)
    region = (max(region[0], page[0]), max(region[1], page[1]), min(region[2], page[2]), min(region[3], page[3]))
    if region[3] > caption[1] and region[1] < caption[1]:
        region = (region[0], region[1], region[2], caption[1] - 1)
    return region


# --------------------------------------------------------- JSON / markers
def parse_json_loose(text: str) -> Optional[dict]:
    """Parse a JSON object out of a model reply (handles ```json fences and chatter)."""
    if not text:
        return None
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.I)
    try:
        v = json.loads(t)
        return v if isinstance(v, dict) else None
    except Exception:
        pass
    s, e = t.find("{"), t.rfind("}")
    if s != -1 and e > s:
        try:
            v = json.loads(t[s:e + 1])
            return v if isinstance(v, dict) else None
        except Exception:
            return None
    return None


_MARKER_RE = re.compile(r"\[\[\s*figure\s*:\s*(\d+)\s*\]\]", re.I)


def extract_figure_markers(answer: str) -> list:
    """Figure ids cited as [[figure:12]] in an answer, in order, de-duplicated."""
    seen, out = set(), []
    for m in _MARKER_RE.finditer(answer or ""):
        i = int(m.group(1))
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def resolve_markers(answer: str, valid: dict) -> tuple:
    """Replace [[figure:ID]] markers.

    `valid` maps id -> label for figures that belong to this chat session.
    Valid markers become a plain "(Figure 3)" mention; invalid ones (hallucinated
    or from another session) are dropped. Returns (clean_answer, [valid ids in order]).
    """
    ids = [i for i in extract_figure_markers(answer) if i in valid]

    def repl(m):
        i = int(m.group(1))
        return f"({valid[i]})" if i in valid else ""

    clean = _MARKER_RE.sub(repl, answer or "")
    clean = re.sub(r"[ \t]+\n", "\n", clean)
    clean = re.sub(r" {2,}", " ", clean)
    clean = re.sub(r" +([.,;:!?])", r"\1", clean)
    return clean, ids


_LABEL_RE = re.compile(r"\bfig(?:ure|\.)?\s*(\d+|[IVXL]+)\b", re.I)


def labels_in_text(text: str) -> list:
    """Normalised labels mentioned in a question, e.g. 'fig 3' -> 'Figure 3'."""
    out = []
    for m in _LABEL_RE.finditer(text or ""):
        lab = f"Figure {m.group(1).upper()}"
        if lab not in out:
            out.append(lab)
    return out
