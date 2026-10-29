"""Pure helpers for grounded answers: numbered passages, citation checking, locating a passage
in a PDF, and parsing the model's table output. No database, LangChain or PyMuPDF imports."""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from .token_budget import estimate_tokens, truncate_text

_WS = re.compile(r"\s+")


def norm(text: str) -> str:
    """Whitespace-collapsed, de-hyphenated, lower-cased text for matching."""
    t = (text or "").replace("­", "")
    t = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", t)          # "meth-\nod" -> "method"
    return _WS.sub(" ", t).strip().lower()


# ---------------------------------------------------------------- numbered passages
def number_passages(passages: List[Dict[str, Any]], budget_tokens: int) -> Tuple[str, List[Dict[str, Any]]]:
    """Number passages [1], [2], ... in rank order and stop when the budget is used.
    Each passage: {document_id, filename, page, text, ...}. Returns (context_text, included)."""
    lines, included, used = [], [], 0
    for p in passages:
        n = len(included) + 1
        head = f"[{n}] ({p.get('filename') or 'paper'}" + (f", page {p['page']}" if p.get("page") else "") + ")\n"
        body = (p.get("text") or "").strip()
        room = budget_tokens - used - estimate_tokens(head)
        if room < 60:
            break
        if estimate_tokens(body) > room:
            if included:                 # keep whole passages once we already have some
                break
            body = truncate_text(body, room)
        lines.append(head + body)
        included.append({**p, "n": n, "text": body})
        used += estimate_tokens(head) + estimate_tokens(body)
    return "\n\n".join(lines), included


_CITE_GROUP = re.compile(r"\[\s*(\d{1,3}(?:\s*(?:,|;|–|-|and)\s*\d{1,3})*)\s*\]")


def _expand(group: str) -> List[int]:
    nums: List[int] = []
    for part in re.split(r"\s*(?:,|;|and)\s*", group):
        m = re.fullmatch(r"(\d{1,3})\s*[–-]\s*(\d{1,3})", part.strip())
        if m and 0 < int(m.group(2)) - int(m.group(1)) <= 8:
            nums.extend(range(int(m.group(1)), int(m.group(2)) + 1))
        else:
            for x in re.findall(r"\d{1,3}", part):
                nums.append(int(x))
    return nums


def normalize_citations(answer: str, valid: set) -> Tuple[str, List[int]]:
    """Rewrite "[1, 3]" as "[1][3]", drop citations that point at nothing, and list the cited
    numbers in order of first use. A model that invents [9] cannot create a dangling citation."""
    used: List[int] = []

    def repl(m: re.Match) -> str:
        nums = [n for n in _expand(m.group(1)) if n in valid]
        for n in nums:
            if n not in used:
                used.append(n)
        return "".join(f"[{n}]" for n in dict.fromkeys(nums))

    return _CITE_GROUP.sub(repl, answer or ""), used


# ---------------------------------------------------------------- locating a passage in a PDF
def snippet_candidates(text: str, words: int = 9, max_candidates: int = 4) -> List[str]:
    """Short phrases taken from a passage, used to find it on the page. Chunk edges are arbitrary,
    so the first and last word (possibly cut) are skipped."""
    toks = _WS.sub(" ", text or "").strip().split(" ")
    if len(toks) < 6:
        return [" ".join(toks)] if toks and toks[0] else []
    toks = toks[1:-1]
    out: List[str] = []
    n = len(toks)
    for frac in (0.0, 0.5, 0.25, 0.75)[:max_candidates]:
        start = min(int(n * frac), max(0, n - words))
        phrase = " ".join(toks[start:start + words]).strip()
        if len(phrase) >= 20 and phrase not in out:
            out.append(phrase)
    return out


def find_page(pages: List[str], passage: str) -> Optional[int]:
    """1-based page number where the passage starts, or None."""
    normed = [norm(p) for p in pages]
    for cand in snippet_candidates(passage):
        c = norm(cand)
        for i, pt in enumerate(normed):
            if c and c in pt:
                return i + 1
    return None


# ---------------------------------------------------------------- model output parsing
def extract_json_object(text: str) -> Optional[dict]:
    """First JSON object in a model reply, tolerating code fences and chatter around it."""
    if not text:
        return None
    t = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", t, re.S)
    if fence:
        t = fence.group(1)
    start = t.find("{")
    while start != -1:
        depth, in_str, esc = 0, False, False
        for i in range(start, len(t)):
            ch = t[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        obj = json.loads(t[start:i + 1])
                        if isinstance(obj, dict):
                            return obj
                    except ValueError:
                        pass
                    break
        start = t.find("{", start + 1)
    return None


def clean_table_cells(obj: Optional[dict], columns: List[str], valid: set) -> Dict[str, Dict[str, Any]]:
    """{column: {"text": str, "cites": [n, ...]}} for every requested column; missing -> "Not stated"."""
    cells: Dict[str, Dict[str, Any]] = {}
    src = obj or {}
    lowered = {str(k).strip().lower(): v for k, v in src.items()}
    for col in columns:
        v = lowered.get(col.strip().lower())
        text, cites = "", []
        if isinstance(v, dict):
            text = str(v.get("answer") or v.get("text") or "").strip()
            raw = v.get("cite") or v.get("cites") or v.get("citations") or []
            raw = raw if isinstance(raw, list) else [raw]
            for r in raw:
                try:
                    n = int(str(r).strip("[] "))
                except ValueError:
                    continue
                if n in valid and n not in cites:
                    cites.append(n)
        elif isinstance(v, str):
            text = v.strip()
        # inline [n] markers inside the text count as cites too, and are then removed from the text
        text, inline = normalize_citations(text, valid)
        for n in inline:
            if n not in cites:
                cites.append(n)
        text = re.sub(r"\[\d+\]", "", text).strip()
        if not text or text.lower() in ("n/a", "none", "null", "unknown"):
            text, cites = "Not stated in the retrieved passages", []
        cells[col] = {"text": text[:600], "cites": cites}
    return cells


_PAGE_CITE = re.compile(r"\[\s*p(?:p)?\.?\s*(\d{1,4}(?:\s*(?:,|;|–|-)\s*(?:p\.?\s*)?\d{1,4})*)\s*\]", re.I)


def normalize_page_cites(text: str, page_count: int) -> Tuple[str, List[int]]:
    """Standardise page citations to [p.N]; drop pages the paper does not have."""
    pages: List[int] = []

    def repl(m: re.Match) -> str:
        nums: List[int] = []
        parts = re.split(r"\s*[,;]\s*", m.group(1))
        for part in parts:
            rng = re.fullmatch(r"(\d{1,4})\s*[–-]\s*(?:p\.?\s*)?(\d{1,4})", part.strip())
            if rng and 0 < int(rng.group(2)) - int(rng.group(1)) <= 5:
                nums.extend(range(int(rng.group(1)), int(rng.group(2)) + 1))
            else:
                nums.extend(int(x) for x in re.findall(r"\d{1,4}", part))
        nums = [n for n in dict.fromkeys(nums) if 1 <= n <= page_count]
        for n in nums:
            if n not in pages:
                pages.append(n)
        return "".join(f"[p.{n}]" for n in nums)

    return _PAGE_CITE.sub(repl, text or ""), pages
