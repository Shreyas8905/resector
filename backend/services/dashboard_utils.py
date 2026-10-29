"""Pure helpers for dashboards (no database, no PyMuPDF), so they can be unit-tested."""
from __future__ import annotations

import json
import math
import re
from typing import Any, Optional

NODE_TYPES = {"paper", "excerpt", "note", "claim", "frame", "answer", "table"}
EDGE_KINDS = {"related", "supports", "contradicts", "extends", "method", "cites", "custom"}
MAX_NODES = 2000
MAX_EDGES = 5000
MAX_DATA_BYTES = 200_000


def _num(v: Any, default: float = 0.0) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    return f if math.isfinite(f) else default


def clamp01(v: Any) -> float:
    return min(1.0, max(0.0, _num(v)))


def normalize_rects(rects: Any, max_rects: int = 200) -> list:
    """[[x0,y0,x1,y1], ...] as fractions of the page (0..1, top-left origin). Fixes order, clamps,
    drops empty rectangles."""
    out = []
    if not isinstance(rects, list):
        return out
    for r in rects[:max_rects]:
        if not isinstance(r, (list, tuple)) or len(r) != 4:
            continue
        x0, y0, x1, y1 = (clamp01(v) for v in r)
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = min(y0, y1), max(y0, y1)
        if x1 - x0 < 0.001 or y1 - y0 < 0.001:
            continue
        out.append([round(x0, 5), round(y0, 5), round(x1, 5), round(y1, 5)])
    return out


def union_rect(rects: list) -> Optional[list]:
    if not rects:
        return None
    return [min(r[0] for r in rects), min(r[1] for r in rects),
            max(r[2] for r in rects), max(r[3] for r in rects)]


def clean_text(s: Any, limit: int = 4000) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()[:limit]


def context_around(page_text: str, quote: str, width: int = 80) -> tuple:
    """Characters before/after `quote` on the page. Used later to re-find an excerpt if the
    coordinates ever stop matching. Returns ("", "") when the quote cannot be located."""
    page = re.sub(r"\s+", " ", page_text or "")
    q = clean_text(quote)
    if not page or not q:
        return "", ""
    idx = page.find(q)
    if idx == -1:
        idx = page.lower().find(q.lower())
    if idx == -1 and len(q) > 40:                       # selection may span a line-break artefact
        head = q[:40]
        idx = page.lower().find(head.lower())
        q = head
    if idx == -1:
        return "", ""
    return page[max(0, idx - width):idx].strip(), page[idx + len(q):idx + len(q) + width].strip()


def _json_size(v: Any) -> int:
    try:
        return len(json.dumps(v, ensure_ascii=False))
    except (TypeError, ValueError):
        return MAX_DATA_BYTES + 1


def validate_canvas(nodes: Any, edges: Any) -> tuple:
    """Validate and normalise what the browser sends. Returns (nodes, edges); raises ValueError."""
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise ValueError("nodes and edges must be lists")
    if len(nodes) > MAX_NODES or len(edges) > MAX_EDGES:
        raise ValueError("canvas too large")

    clean_nodes, ids = [], set()
    for n in nodes:
        if not isinstance(n, dict):
            raise ValueError("invalid node")
        nid = str(n.get("id") or "")
        ntype = n.get("type")
        if not nid or len(nid) > 64:
            raise ValueError("invalid node id")
        if ntype not in NODE_TYPES:
            raise ValueError(f"unknown node type: {ntype}")
        if nid in ids:
            continue
        ids.add(nid)
        pos = n.get("position") or {}
        data = n.get("data") if isinstance(n.get("data"), dict) else {}
        if _json_size(data) > MAX_DATA_BYTES:
            raise ValueError("node data too large")
        w, h = n.get("width"), n.get("height")
        clean_nodes.append({
            "id": nid, "type": ntype,
            "x": _num(pos.get("x")), "y": _num(pos.get("y")),
            "width": _num(w) if w is not None else None,
            "height": _num(h) if h is not None else None,
            "data": data,
        })

    clean_edges, eids = [], set()
    for e in edges:
        if not isinstance(e, dict):
            raise ValueError("invalid edge")
        eid, src, dst = str(e.get("id") or ""), str(e.get("source") or ""), str(e.get("target") or "")
        if not eid or len(eid) > 64 or eid in eids:
            continue
        if src not in ids or dst not in ids:
            continue                                   # dangling edge: drop silently
        data = e.get("data") if isinstance(e.get("data"), dict) else {}
        kind = data.get("kind") if data.get("kind") in EDGE_KINDS else "related"
        eids.add(eid)
        clean_edges.append({
            "id": eid, "source": src, "target": dst,
            "source_handle": (str(e["sourceHandle"])[:32] if e.get("sourceHandle") else None),
            "target_handle": (str(e["targetHandle"])[:32] if e.get("targetHandle") else None),
            "kind": kind, "label": clean_text(data.get("label"), 200),
        })
    return clean_nodes, clean_edges
