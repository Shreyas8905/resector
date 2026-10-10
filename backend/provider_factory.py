from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from pydantic import BaseModel, field_validator
import logging

logger = logging.getLogger(__name__)


class ProviderConfig(BaseModel):
    provider: str
    api_key: str
    model_name: Optional[str] = None

    @field_validator('api_key')
    @classmethod
    def validate_api_key(cls, v: str) -> str:
        """Ensure API key is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError("API key cannot be empty or whitespace-only")
        return v.strip()

    @field_validator('provider')
    @classmethod
    def validate_provider(cls, v: str) -> str:
        """Normalize provider name to lowercase."""
        return v.lower().strip()


class LLMProvider(ABC):
    @abstractmethod
    def get_model(self, config: ProviderConfig):
        pass


class OpenAIProvider(LLMProvider):
    def get_model(self, config: ProviderConfig):
        return ChatOpenAI(
            openai_api_key=config.api_key,
            model=config.model_name or "gpt-4o"
        )


class AnthropicProvider(LLMProvider):
    def get_model(self, config: ProviderConfig):
        return ChatAnthropic(
            anthropic_api_key=config.api_key,
            model=config.model_name or "claude-3-5-sonnet-20240620"
        )


class GoogleProvider(LLMProvider):
    def get_model(self, config: ProviderConfig):
        return ChatGoogleGenerativeAI(
            google_api_key=config.api_key,
            model=config.model_name or "gemini-1.5-pro"
        )


class GroqProvider(LLMProvider):
    def get_model(self, config: ProviderConfig):
        return ChatGroq(
            groq_api_key=config.api_key,
            model=config.model_name or "llama-3.3-70b-versatile"
        )


class ProviderFactory:
    _providers = {
        "openai": OpenAIProvider(),
        "anthropic": AnthropicProvider(),
        "google": GoogleProvider(),
        "groq": GroqProvider(),
    }

    @classmethod
    def get_llm(cls, config: ProviderConfig):
        provider = cls._providers.get(config.provider.lower())
        if not provider:
            supported = ", ".join(cls._providers.keys())
            raise ValueError(f"Unsupported provider: {config.provider}. Supported providers: {supported}")
        logger.debug(f"Creating {config.provider} LLM with model: {config.model_name or 'default'}")
        return provider.get_model(config)

    @classmethod
    def get_supported_providers(cls) -> list:
        """Returns list of supported provider names."""
        return list(cls._providers.keys())
