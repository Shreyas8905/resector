"""Keeps every LLM request under the provider's per-request / per-minute token limit.

Three layers, all provider-agnostic:
  1. fit_messages(): trims a message list to a token budget (tool output first, then old
     history, then the new message) before each model call.
  2. get_budget(): per-model limits, corrected automatically from the provider's own error text.
  3. error helpers so callers can shrink and retry instead of failing.

Token counts are estimates (characters / 3.2), deliberately on the high side.
"""
from __future__ import annotations

import math
import re
import threading
from typing import Any, List, Optional, Tuple

CHARS_PER_TOKEN = 3.2
TRIM_NOTE = "\n[…trimmed to fit the model's size limit…]\n"

# Starting guesses for providers whose limit depends on the account tier. They are corrected from
# the provider's error message the first time a request is too large (see learn_from_error).
_GROQ_FREE_TPM = {
    "gpt-oss": 8000, "llama-3.3-70b": 12000, "llama-3.1-8b": 6000,
    "llama-4": 30000, "qwen": 6000, "kimi": 10000,
}
DEFAULT_GROQ_TPM = 6000
DEFAULT_OTHER_LIMIT = 24000

_learned: dict = {}
_lock = threading.Lock()


# ---------------------------------------------------------------- estimation
def estimate_tokens(text: Any) -> int:
    return math.ceil(len(str(text or "")) / CHARS_PER_TOKEN)


def content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        out = []
        for b in content:
            if isinstance(b, str):
                out.append(b)
            elif isinstance(b, dict) and b.get("type") == "text":
                out.append(b.get("text", ""))
        return "".join(out)
    return str(content or "")


def message_tokens(m: Any) -> int:
    n = estimate_tokens(content_text(getattr(m, "content", ""))) + 6
    for call in getattr(m, "tool_calls", None) or []:
        n += estimate_tokens(str(call.get("args", ""))) + 10
    return n


def total_tokens(messages: List[Any], overhead: int = 0) -> int:
    return sum(message_tokens(m) for m in messages) + overhead


# ---------------------------------------------------------------- budgets
def _key(provider: str, model: Optional[str]) -> Tuple[str, str]:
    return (provider or "").lower(), (model or "").lower()


def default_limit(provider: str, model: Optional[str]) -> int:
    provider, model = _key(provider, model)
    if provider == "groq":
        for frag, lim in _GROQ_FREE_TPM.items():
            if frag in model:
                return lim
        return DEFAULT_GROQ_TPM
    return DEFAULT_OTHER_LIMIT


def request_limit(provider: str, model: Optional[str]) -> int:
    """Tokens allowed in one request (input + the reply we ask for)."""
    with _lock:
        learned = _learned.get(_key(provider, model))
    base = default_limit(provider, model)
    return min(base, learned) if learned else base


def input_budget(provider: str, model: Optional[str], shrink: float = 1.0) -> int:
    """Tokens we allow ourselves to send, leaving room for the reply and estimation error."""
    limit = request_limit(provider, model)
    reserve = 1500 if limit <= 12000 else min(4000, int(limit * 0.12))
    return max(800, int((limit - reserve) * 0.92 * shrink))


def learn_from_error(provider: str, model: Optional[str], message: str) -> Optional[int]:
    """Remember the real limit a provider reported. Returns it, if the message contained one."""
    parsed = parse_limit(message)
    if not parsed:
        return None
    with _lock:
        k = _key(provider, model)
        _learned[k] = min(parsed, _learned.get(k, parsed))
    return parsed


def reset_learned():
    with _lock:
        _learned.clear()


# ---------------------------------------------------------------- error text
_LIMIT_PATTERNS = [
    re.compile(r"limit\s+(\d{3,7}),\s*requested\s+\d+", re.I),                   # Groq TPM
    re.compile(r"maximum context length is\s+(\d{3,7})\s+tokens", re.I),         # OpenAI
    re.compile(r"prompt is too long:\s*\d+\s+tokens?\s*>\s*(\d{3,7})", re.I),    # Anthropic
    re.compile(r"input token count.*?exceeds the maximum.*?(\d{3,7})", re.I),    # Google
]


def parse_limit(message: str) -> Optional[int]:
    for p in _LIMIT_PATTERNS:
        m = p.search(message or "")
        if m:
            return int(m.group(1))
    return None


def is_too_large_error(e: Any) -> bool:
    msg = str(e).lower()
    if "error code: 413" in msg or "request too large" in msg or "reduce your message size" in msg:
        return True
    if "maximum context length" in msg or "prompt is too long" in msg or "context_length_exceeded" in msg:
        return True
    m = re.search(r"limit\s+(\d+),\s*requested\s+(\d+)", msg)
    return bool(m and int(m.group(2)) > int(m.group(1)))     # asked for more than a whole minute allows


def retry_after_seconds(e: Any, default: float = 10.0) -> float:
    m = re.search(r"try again in\s+(?:(\d+)m)?\s*([\d.]+)\s*(ms|s)\b", str(e).lower())
    if not m:
        return default
    secs = float(m.group(2)) / (1000 if m.group(3) == "ms" else 1) + (int(m.group(1) or 0) * 60)
    return min(max(secs + 1, 1.0), 65.0)


# ---------------------------------------------------------------- trimming
def truncate_text(text: str, max_tokens: int, keep_tail: float = 0.0) -> str:
    """Cut text to roughly max_tokens, keeping the start (and optionally a share of the end)."""
    max_chars = max(80, int(max_tokens * CHARS_PER_TOKEN))
    if len(text) <= max_chars:
        return text
    room = max(40, max_chars - len(TRIM_NOTE))          # the note counts toward the budget
    if keep_tail > 0:
        tail = int(room * keep_tail)
        return text[: room - tail] + TRIM_NOTE + text[-tail:]
    return text[:room] + TRIM_NOTE


def _with_content(m: Any, content: str) -> Any:
    return m.model_copy(update={"content": content})


def _kind(m: Any) -> str:
    return getattr(m, "type", "")          # "system" | "human" | "ai" | "tool"


def fit_messages(messages: List[Any], budget: int, overhead: int = 0) -> List[Any]:
    """Return a copy of `messages` that fits `budget` tokens (plus `overhead` for tool schemas).

    Order of sacrifice: oversized tool output -> long old messages -> whole old messages ->
    more tool output -> the new question itself. The system prompt is kept unless it alone is huge.
    Message order and tool-call/tool-result pairing are never broken.
    """
    msgs = list(messages)
    if total_tokens(msgs, overhead) <= budget:
        return msgs
    last_human = max((i for i, m in enumerate(msgs) if _kind(m) == "human"), default=len(msgs) - 1)

    def fits() -> bool:
        return total_tokens(msgs, overhead) <= budget

    # 1. cap each tool result
    cap = max(300, int(budget * 0.22))
    for i, m in enumerate(msgs):
        if _kind(m) == "tool" and message_tokens(m) > cap:
            msgs[i] = _with_content(m, truncate_text(content_text(m.content), cap))
    if fits():
        return msgs

    # 2. shorten old (pre-question) turns
    for i, m in enumerate(msgs[:last_human]):
        if _kind(m) in ("human", "ai") and message_tokens(m) > 260:
            msgs[i] = _with_content(m, truncate_text(content_text(m.content), 240))
    if fits():
        return msgs

    # 3. drop oldest history, whole messages, never the system prompt
    i = 0
    while not fits() and i < last_human:
        if _kind(msgs[i]) != "system":
            del msgs[i]
            last_human -= 1
        else:
            i += 1
    if fits():
        return msgs

    # 4. squeeze current-turn tool output further: older results first, the newest one last,
    #    so the model keeps the evidence it just asked for (squeezing it all equally makes the
    #    model ask again and again).
    tool_idx = [i for i, m in enumerate(msgs) if _kind(m) == "tool" and i > last_human]
    older, latest = tool_idx[:-1], tool_idx[-1:]
    for share in (0.10, 0.05, 0.025):
        for i in older:
            cap = max(80, int(budget * share))
            if message_tokens(msgs[i]) > cap:
                msgs[i] = _with_content(msgs[i], truncate_text(content_text(msgs[i].content), cap))
        if fits():
            return msgs
    for share in (0.30, 0.20, 0.12, 0.06):
        for i in latest:
            cap = max(120, int(budget * share))
            if message_tokens(msgs[i]) > cap:
                msgs[i] = _with_content(msgs[i], truncate_text(content_text(msgs[i].content), cap))
        if fits():
            return msgs

    # 5. a very large system prompt, then the question itself
    for i, m in enumerate(msgs):
        if _kind(m) == "system" and message_tokens(m) > budget * 0.4:
            msgs[i] = _with_content(m, truncate_text(content_text(m.content), int(budget * 0.4)))
    if not fits() and msgs and _kind(msgs[last_human]) == "human":
        others = total_tokens(msgs, overhead) - message_tokens(msgs[last_human])
        room = max(200, budget - others - 10)
        msgs[last_human] = _with_content(msgs[last_human], truncate_text(content_text(msgs[last_human].content), room, keep_tail=0.25))
    return msgs


def make_prompt_hook(budget_fn, overhead: int = 0):
    """For create_react_agent(prompt=...): called before every model call with the graph state."""
    def hook(state: Any) -> List[Any]:
        messages = state["messages"] if isinstance(state, dict) else state
        return fit_messages(list(messages), budget_fn(), overhead)
    return hook


def split_for_condense(text: str, max_tokens: int) -> List[str]:
    """Split long text into pieces of about max_tokens on paragraph boundaries (no langchain needed)."""
    max_chars = int(max_tokens * CHARS_PER_TOKEN)
    if len(text) <= max_chars:
        return [text]
    parts, cur, size = [], [], 0
    for para in re.split(r"\n{2,}|(?<=[.!?])\s+", text):
        while len(para) > max_chars:                       # one giant unbroken block
            if cur:
                parts.append("\n\n".join(cur)); cur, size = [], 0
            parts.append(para[:max_chars]); para = para[max_chars:]
        if size + len(para) > max_chars and cur:
            parts.append("\n\n".join(cur)); cur, size = [], 0
        cur.append(para); size += len(para) + 2
    if cur:
        parts.append("\n\n".join(cur))
    return parts
