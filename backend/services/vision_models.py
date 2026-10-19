"""Pick a vision-capable chat model for the provider the user already configured.

Built directly on the LangChain classes so it does not depend on provider_factory.
Only the user's own key is used; it is never written to disk or the database.
"""
from __future__ import annotations

VISION_DEFAULTS = {
    "openai": "gpt-4o",
    "anthropic": "claude-sonnet-4-5",
    "google": "gemini-2.5-flash",
    "groq": "meta-llama/llama-4-scout-17b-16e-instruct",
}

# Substrings that mark a model id as image-capable (used to decide whether the
# user's chosen chat model can be reused for figures).
_VISION_HINTS = {
    "openai": ("gpt-4o", "gpt-4.1", "gpt-5", "o4"),
    "anthropic": ("claude-3", "claude-sonnet", "claude-opus", "claude-haiku", "claude-fable", "claude-mythos"),
    "google": ("gemini",),
    "groq": ("llama-4", "scout", "maverick"),
}

MAX_IMAGES_PER_REQUEST = {"groq": 5}


def normalize_provider(provider: str) -> str:
    p = (provider or "").lower().strip()
    return {"gemini": "google", "google_genai": "google", "claude": "anthropic"}.get(p, p)


def is_vision_capable(provider: str, model_name: str | None) -> bool:
    p = normalize_provider(provider)
    m = (model_name or "").lower()
    return bool(m) and any(h in m for h in _VISION_HINTS.get(p, ()))


def pick_vision_model(provider: str, chat_model: str | None = None, vision_model: str | None = None) -> str:
    """Explicit vision_model > the chat model if it can see > provider default."""
    if vision_model:
        return vision_model
    if is_vision_capable(provider, chat_model):
        return chat_model  # type: ignore[return-value]
    p = normalize_provider(provider)
    if p not in VISION_DEFAULTS:
        raise ValueError(f"Provider '{provider}' has no known vision model")
    return VISION_DEFAULTS[p]


def build_vision_llm(provider: str, api_key: str, model: str):
    p = normalize_provider(provider)
    if p == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model, api_key=api_key, temperature=0, max_retries=0)
    if p == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=model, api_key=api_key, temperature=0, max_tokens=1500, max_retries=0)
    if p == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=model, google_api_key=api_key, temperature=0, max_retries=0)
    if p == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(model=model, api_key=api_key, temperature=0, max_retries=0)
    raise ValueError(f"Unsupported provider for vision: {provider}")
