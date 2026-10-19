"""Figures for the one-shot tools (Sifter / Critique / Jargon) when a PDF is uploaded.

No chat session exists there, so figures are stored under a throw-away
"tool-<id>" session, described, summarised into a short digest the model can
read, and the figures the answer actually mentions are shown under it.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

from ..database import Figure
from .figures import ingest_document_figures, delete_session_figures
from .figure_utils import labels_in_text

KEEP_DAYS = 7


def cleanup_old_tool_figures(db) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)
    old = db.query(Figure.session_id).filter(Figure.session_id.like("tool-%"), Figure.created_at < cutoff).distinct().all()
    for (sid,) in old:
        delete_session_figures(db, sid)


def prepare_tool_figures(db, pdf_path: str, filename: str, vision_llm=None) -> list:
    """Extract (and describe, if vision_llm) the paper's figures. Returns figure dicts."""
    cleanup_old_tool_figures(db)
    sid = f"tool-{uuid.uuid4().hex[:12]}"
    stats = ingest_document_figures(db, None, sid, 0, filename, pdf_path, vision_llm=vision_llm)
    return stats["figures"]


def figure_digest(figs: list, max_chars: int = 3000) -> str:
    """Compact text the model can use to talk about the figures by label."""
    if not figs:
        return ""
    lines = ["", "FIGURES IN THIS PAPER (you may refer to them by label, e.g. 'Figure 3'):"]
    for f in figs:
        body = f.get("description") or f.get("caption") or ""
        lines.append(f"- {f['label']} (p.{f['page']}): {body}"[:500])
    out = "\n".join(lines)
    return out[:max_chars]


def figures_mentioned(output: str, figs: list, max_n: int = 4) -> list:
    wanted = labels_in_text(output)
    by_label = {f["label"]: f for f in figs}
    return [by_label[l] for l in wanted if l in by_label][:max_n]


def append_figures_markdown(output: str, shown: list, api_base: str = "") -> str:
    """Add the mentioned figures under the answer as markdown images."""
    if not shown:
        return output
    parts = ["", "", "---", "**Figures referenced**", ""]
    for f in shown:
        cap = re.sub(r"[\[\]\n]", " ", f.get("caption") or "")[:160]
        parts.append(f"![{f['label']}]({api_base}{f['url']})\n*{f['label']}, p.{f['page']}. {cap}*\n")
    return output + "\n".join(parts)
