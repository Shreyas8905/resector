"""Describe figures with a vision model."""
from __future__ import annotations

import base64
import mimetypes
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Optional

from .figure_utils import parse_json_loose

PROMPT = """You are reading a figure from a research paper so that its content can be searched \
and explained later without looking at the image.

Caption: {caption}

Reply with ONE JSON object and nothing else:
{{
  "kind": "one of: bar_chart, line_chart, scatter_plot, heatmap, table_image, architecture_diagram, flowchart, pipeline, model_output_examples, photo, other",
  "description": "3-6 sentences: what is shown, axes/labels/units, the series or components compared, and the main trend or structure",
  "key_facts": ["up to 6 short, concrete facts: exact numbers read from the plot, best/worst items, how components connect"],
  "text_in_figure": "important labels, legends or text visible in the image (short)"
}}
Only state what is visible. If a number is not legible, say so instead of guessing."""


def _data_uri(path: str) -> str:
    mime = mimetypes.guess_type(path)[0] or "image/png"
    with open(path, "rb") as f:
        return f"data:{mime};base64,{base64.b64encode(f.read()).decode()}"


def _is_rate_limit(exc: Exception) -> bool:
    s = f"{type(exc).__name__} {exc}".lower()
    return "429" in s or "rate limit" in s or "ratelimit" in s or "resource_exhausted" in s


def _retry_wait(exc: Exception, attempt: int) -> float:
    m = re.search(r"try again in\s+(?:(\d+)m)?\s*([\d.]+)s", str(exc), re.I)
    if m:
        return min(90.0, int(m.group(1) or 0) * 60 + float(m.group(2)) + 1)
    return min(60.0, 5.0 * (2 ** attempt))


def _text_of(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
    return str(content)


def describe_figure(llm, image_path: str, caption: str, retries: int = 3) -> dict:
    """Return {kind, description, key_facts[list], text_in_figure}. Raises on persistent failure."""
    from langchain_core.messages import HumanMessage

    msg = HumanMessage(content=[
        {"type": "text", "text": PROMPT.format(caption=caption or "(no caption found)")},
        {"type": "image_url", "image_url": {"url": _data_uri(image_path)}},
    ])
    last: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            raw = _text_of(llm.invoke([msg]).content)
            data = parse_json_loose(raw)
            if not data:
                data = {"kind": "other", "description": raw.strip()[:1500]}
            facts = data.get("key_facts") or []
            if isinstance(facts, str):
                facts = [facts]
            return {
                "kind": str(data.get("kind") or "other")[:40],
                "description": str(data.get("description") or "").strip(),
                "key_facts": [str(x).strip() for x in facts][:6],
                "text_in_figure": str(data.get("text_in_figure") or "").strip()[:600],
            }
        except Exception as e:  # noqa: BLE001
            last = e
            if attempt < retries and _is_rate_limit(e):
                time.sleep(_retry_wait(e, attempt))
                continue
            break
    raise last  # type: ignore[misc]


def describe_many(llm, items: list, workers: int = 2,
                  on_progress: Optional[Callable[[int, int], None]] = None) -> list:
    """items: [{'path','caption',...}] -> same list with a 'vision' key (dict) or 'vision_error' (str)."""
    done = 0

    def work(it):
        try:
            it["vision"] = describe_figure(llm, it["path"], it.get("caption", ""))
        except Exception as e:  # noqa: BLE001
            it["vision_error"] = f"{type(e).__name__}: {str(e)[:200]}"
        return it

    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        for _ in ex.map(work, items):
            done += 1
            if on_progress:
                on_progress(done, len(items))
    return items


def figure_search_text(label: str, page: int, caption: str, vision: Optional[dict]) -> str:
    """The text that gets embedded in Chroma for one figure."""
    parts = [f"{label} (page {page}). {caption}".strip()]
    if vision:
        if vision.get("description"):
            parts.append(vision["description"])
        if vision.get("key_facts"):
            parts.append("Key facts: " + "; ".join(vision["key_facts"]))
        if vision.get("text_in_figure"):
            parts.append("Text in figure: " + vision["text_in_figure"])
    return "\n".join(parts)
