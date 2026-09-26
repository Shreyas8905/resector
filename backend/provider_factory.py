from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.chat_models import ChatGroq
from pydantic import BaseModel

class ProviderConfig(BaseModel):
    provider: str
    api_key: str
    model_name: Optional[str] = None

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
            raise ValueError(f"Unsupported provider: {config.provider}")
        return provider.get_model(config)
