"""Pure helpers for agent wiring: pair planning, prompts, and strict validation of what the model
returns. The rule they enforce: a suggested link must quote evidence from the papers it connects."""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .grounding import extract_json_object

RELATIONS = ("supports", "contradicts", "extends", "method")


def pair_key(a_kind: str, a_ref: Any, b_kind: str, b_ref: Any) -> str:
    """Order-independent id of a pair, so A-B and B-A are the same suggestion."""
    x, y = sorted([f"{a_kind}:{a_ref}", f"{b_kind}:{b_ref}"])
    return f"{x}|{y}"


def plan_pairs(items: List[Tuple[str, Any]], scores: Dict[str, float], existing: Iterable[str],
               max_pairs: int) -> List[Tuple[Tuple[str, Any], Tuple[str, Any]]]:
    """All unordered pairs not already suggested/dismissed, most similar first (lower score = closer),
    cut to max_pairs. Pairs without a score go last, in input order."""
    seen = set(existing)
    cand = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            a, b = items[i], items[j]
            k = pair_key(a[0], a[1], b[0], b[1])
            if k in seen:
                continue
            cand.append((scores.get(k, float("inf")), len(cand), a, b))
    cand.sort(key=lambda c: (c[0], c[1]))
    return [(a, b) for _, _, a, b in cand[:max(0, max_pairs)]]


JUDGE_SYSTEM = (
    "You decide whether two items are connected by a specific scientific relationship, using ONLY the "
    "numbered passages. Be conservative: if the passages do not clearly show it, answer \"none\".\n"
    "Relations: supports (one item's findings back up the other's claim), contradicts (findings or claims "
    "conflict), extends (one builds on or improves the other), method (they use the same or a closely "
    "related method, dataset or setup).\n"
    "Return ONE JSON object and nothing else:\n"
    '{"relation": "supports|contradicts|extends|method|none", "direction": "a_to_b|b_to_a", '
    '"summary": "<=30 words saying exactly how they are related", "evidence": [passage numbers], '
    '"confidence": 0.0-1.0}\n'
    "direction matters only for extends/supports: a_to_b means A extends or supports B. "
    "evidence must list the passages you relied on, from BOTH items when both are papers."
)


def format_side(label: str, name: str, passages: List[Dict[str, Any]], start: int) -> Tuple[str, List[int]]:
    """Numbered passages of one side. Returns (text, numbers)."""
    lines, nums = [f"ITEM {label}: {name}"], []
    for i, p in enumerate(passages):
        n = start + i
        nums.append(n)
        pg = f", page {p['page']}" if p.get("page") else ""
        lines.append(f"[{n}] ({name}{pg})\n{(p.get('text') or '').strip()}")
    return "\n\n".join(lines), nums


def parse_judgement(raw: str, nums_a: List[int], nums_b: List[int], need_a: bool = True,
                    need_b: bool = True, min_confidence: float = 0.5) -> Optional[Dict[str, Any]]:
    """Validated judgement or None. Rejects: no JSON, relation none/unknown, evidence outside the
    given passages, evidence missing from a side that requires it, low confidence."""
    obj = extract_json_object(raw)
    if not obj:
        return None
    rel = str(obj.get("relation", "")).strip().lower()
    if rel not in RELATIONS:
        return None
    valid = set(nums_a) | set(nums_b)
    ev: List[int] = []
    raw_ev = obj.get("evidence")
    for x in raw_ev if isinstance(raw_ev, list) else [raw_ev]:
        m = re.search(r"\d+", str(x))
        if m and int(m.group()) in valid and int(m.group()) not in ev:
            ev.append(int(m.group()))
    if need_a and not set(ev) & set(nums_a):
        return None
    if need_b and not set(ev) & set(nums_b):
        return None
    try:
        conf = float(obj.get("confidence", 0.6))
    except (TypeError, ValueError):
        conf = 0.6
    conf = max(0.0, min(1.0, conf))
    if conf < min_confidence:
        return None
    summary = re.sub(r"\s+", " ", str(obj.get("summary") or "")).strip()[:300]
    if not summary:
        return None
    direction = "b_to_a" if str(obj.get("direction", "")).strip().lower() == "b_to_a" else "a_to_b"
    return {"relation": rel, "direction": direction, "summary": summary, "evidence": ev, "confidence": round(conf, 2)}


GAP_SYSTEM = (
    "A researcher states a claim of their own. Using ONLY the numbered passages from their paper collection, "
    "say how well the collection backs it.\n"
    "Return ONE JSON object and nothing else:\n"
    '{"verdict": "supported|partly|contradicted|not_covered", '
    '"supporting": [passage numbers], "contradicting": [passage numbers], '
    '"missing": "<=40 words: what evidence the collection does NOT contain", '
    '"search": "a short literature search query that would fill the gap"}\n'
    "Only list a passage as supporting or contradicting if it clearly says so. Never invent evidence."
)

VERDICTS = ("supported", "partly", "contradicted", "not_covered")


def parse_gap(raw: str, valid: List[int]) -> Optional[Dict[str, Any]]:
    obj = extract_json_object(raw)
    if not obj:
        return None
    verdict = str(obj.get("verdict", "")).strip().lower().replace(" ", "_")
    if verdict not in VERDICTS:
        return None

    def nums(key: str) -> List[int]:
        out: List[int] = []
        v = obj.get(key)
        for x in v if isinstance(v, list) else []:
            m = re.search(r"\d+", str(x))
            if m and int(m.group()) in valid and int(m.group()) not in out:
                out.append(int(m.group()))
        return out

    sup, con = nums("supporting"), nums("contradicting")
    # a verdict that claims support or contradiction must show the passage
    if verdict == "supported" and not sup:
        verdict = "not_covered"
    if verdict == "contradicted" and not con:
        verdict = "not_covered"
    clean = lambda k, n: re.sub(r"\s+", " ", str(obj.get(k) or "")).strip()[:n]
    return {"verdict": verdict, "supporting": sup, "contradicting": con,
            "missing": clean("missing", 300), "search": clean("search", 160)}
