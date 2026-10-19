"""Chat/tool glue: the `find_figures` agent tool and answer post-processing."""
from __future__ import annotations

from langchain_core.tools import tool

from .figure_utils import resolve_markers
from .figures import search_figures, valid_figure_labels, figures_by_ids

FIGURE_PROMPT = """
FIGURES: The papers' figures are indexed. When the user asks about a result, trend, comparison, \
architecture, method overview or a specific figure, call find_figures first. Each result has an \
ID. When a figure supports your answer, cite it right after the sentence with its marker, e.g. \
"Accuracy peaks at 8B parameters [[figure:12]]." Use ONLY IDs returned by find_figures. Describe \
what the figure shows in your own words using the description and key facts; do not invent \
numbers that are not in them. At most 3 figures per answer."""


def make_find_figures_tool(db, collection, session_id: str):
    """Build a find_figures tool bound to one chat session (so IDs can't leak across sessions)."""

    @tool
    def find_figures(query: str) -> str:
        """Search the figures (charts, plots, architecture diagrams, tables-as-images) in the
        user's uploaded papers. Pass the topic or a label like 'Figure 3'. Returns figure IDs
        with caption and a description of what the figure shows."""
        figs = search_figures(db, collection, session_id, query, k=3)
        if not figs:
            return "No figures found for this query."
        out = []
        for f in figs:
            out.append(
                f"[figure:{f.id}] {f.label}, page {f.page}"
                + (f" of {f.filename}" if f.filename else "")
                + f"\nCaption: {f.caption or '(none)'}"
                + (f"\nType: {f.kind}" if f.kind else "")
                + (f"\nShows: {f.description}" if f.description else "\n(not analysed: caption only)")
                + (f"\nKey facts: {f.facts.replace(chr(10), '; ')}" if f.facts else "")
            )
        return "\n\n".join(out)

    return find_figures


def finalize_answer(db, session_id: str, answer: str, max_figures: int = 3) -> tuple:
    """Validate [[figure:ID]] markers against the session. Returns (clean_answer, figures list)."""
    import re
    if not isinstance(answer, str):          # some providers return a list of content parts
        answer = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in answer) \
            if isinstance(answer, list) else str(answer)
    ids = [int(x) for x in re.findall(r"\[\[\s*figure\s*:\s*(\d+)\s*\]\]", answer or "", re.I)]
    valid = valid_figure_labels(db, session_id, list(dict.fromkeys(ids)))
    clean, used = resolve_markers(answer, valid)
    return clean, figures_by_ids(db, session_id, used[:max_figures])
