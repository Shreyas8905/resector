from typing import Any, Dict, Optional, List, Annotated
from langchain.tools import tool
from langchain_core.tools import Tool
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel
import logging

from .provider_factory import ProviderFactory, ProviderConfig
from .database import SessionLocal, ResearchLog, get_vector_collection

logger = logging.getLogger(__name__)

# --- Request/Response Models ---

class ResearchRequest(BaseModel):
    text: str
    provider: str
    api_key: str
    tavily_api_key: Optional[str] = None
    model_name: Optional[str] = None
    severity: Optional[str] = "constructive"  # For critique tool


class ResearchResponse(BaseModel):
    output: str
    provider: str


# --- Configuration & Constants ---

PERSONA_MAP = {
    "supportive_peer": "Act as a supportive and encouraging peer. Highlight the strengths of the work, find the 'diamond in the rough', and suggest gentle, constructive improvements to help the author shine.",
    "constructive_colleague": "Act as a professional, balanced colleague. Provide clear, objective feedback focused on validity, clarity, and academic rigor. Be helpful but honest.",
    "rigorous_scholar": "Act as a high-standards academic scholar. Focus intensely on methodology, theoretical grounding, and the quality of evidence. Demand precision and rigor.",
    "brutal_reviewer_2": "Act as the infamous 'Reviewer #2'. Be intellectually ruthless. Search for fatal flaws, logical gaps, and missing variables with surgical precision. Do not sugarcoat.",
    "devils_advocate": "Act as the Devil's Advocate. Your primary goal is to challenge the core hypothesis. Find competing theories, counter-arguments, and alternative explanations that the author ignored."
}


# --- Tools ---

@tool
def web_search(query: str, tavily_api_key: str):
    """Search the web for academic papers, recent findings, and factual data to verify claims or find gaps."""
    try:
        from tavily import TavilyClient
        tavily = TavilyClient(api_key=tavily_api_key)
        response = tavily.search(query=query, search_depth="basic", max_results=3)

        results = []
        for res in response.get('results', []):
            content = (res.get('content') or '')[:600]
            results.append(f"Source: {res.get('url', 'unknown')}\nContent: {content}")

        return "\n\n".join(results) if results else "No results found."
    except ImportError:
        logger.error("Tavily package not installed")
        return "Error: Tavily package not installed. Install with: pip install tavily-python"
    except Exception as e:
        logger.error(f"Web search error: {str(e)}")
        return f"Search error: {str(e)}"


# --- Core Logic ---

class ToolLogic:
    @staticmethod
    def _content_to_text(content) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return "".join(
                b if isinstance(b, str) else b.get("text", "")
                for b in content
                if isinstance(b, str) or (isinstance(b, dict) and b.get("type") == "text")
            )
        return str(content)

    @staticmethod
    def _guidelines(has_search: bool) -> str:
        if has_search:
            return (
                "IMPORTANT GUIDELINES:\n"
                "1. Use web_search at most 2 times, only for the most important checks. Keep queries short.\n"
                "2. Cite ONLY information you obtained from web_search, using inline [1], [2], etc.\n"
                "3. If you cited anything, end with a 'Sources' section listing those URLs. "
                "Never cite or list sources for claims that come from the user's text.\n"
            )
        return (
            "IMPORTANT GUIDELINES:\n"
            "1. Web search is unavailable. Work only from the provided text and your general knowledge.\n"
            "2. Do NOT invent citations, URLs, or references. Mark anything from general knowledge "
            "as unverified.\n"
        )

    @staticmethod
    def _is_too_large(e: Exception) -> bool:
        from langgraph.errors import GraphRecursionError
        msg = str(e).lower()
        return (
            isinstance(e, GraphRecursionError)
            or "413" in msg
            or "request too large" in msg
            or "tokens per minute" in msg
        )

    @staticmethod
    async def _invoke(llm, tools, system_prompt: str, user_input: str) -> str:
        agent = create_react_agent(llm, tools)
        system_message = f"{system_prompt}\n\n{ToolLogic._guidelines(bool(tools))}"
        inputs = {"messages": [SystemMessage(content=system_message), HumanMessage(content=user_input)]}
        result = await agent.ainvoke(inputs, config={"recursion_limit": 10})
        return ToolLogic._content_to_text(result["messages"][-1].content)

    @staticmethod
    async def _run_agent(config: ProviderConfig, system_prompt: str, user_input: str, tavily_api_key: Optional[str] = None):
        llm = ProviderFactory.get_llm(config)

        tools = []
        if tavily_api_key and tavily_api_key.strip():
            search_calls = {"n": 0}
            
            def search_with_key(query: str):
                if search_calls["n"] >= 2:
                    return ("Search limit reached. Do not search again. "
                            "Write your final answer now using what you already have.")
                search_calls["n"] += 1
                return web_search.invoke({"query": query, "tavily_api_key": tavily_api_key})

            tools.append(Tool(
                name="web_search",
                func=search_with_key,
                description="Search the web for academic papers, recent findings, and factual data."
            ))

        try:
            return await ToolLogic._invoke(llm, tools, system_prompt, user_input)
        except Exception as e:
            if tools and ToolLogic._is_too_large(e):
                logger.warning("Request too large with web search; retrying without search")
                text = await ToolLogic._invoke(llm, [], system_prompt, user_input)
                return text + "\n\n*Note: web search was skipped because the request exceeded your provider's token limit.*"
            raise

    @staticmethod
    async def sifter(config: ProviderConfig, text: str, tavily_api_key: Optional[str] = None):
        system_prompt = (
            "You are an expert academic research assistant. Your goal is to sift through research abstracts "
            "and extract core components. Use the web search tool to check if the mentioned findings "
            "have been superseded or if the methodology is standard in the field."
            "\n\nExtract exactly 4 checkpoints:\n"
            "1. Core Research Question\n"
            "2. Methodology & Sample Size\n"
            "3. Key Findings/Metrics\n"
            "4. Fatal Flaws or Limitations"
        )
        return await ToolLogic._run_agent(config, system_prompt, text, tavily_api_key)

    @staticmethod
    async def critique(config: ProviderConfig, text: str, severity: str, tavily_api_key: Optional[str] = None):
        persona_guidelines = PERSONA_MAP.get(severity, PERSONA_MAP["constructive_colleague"])

        system_prompt = (
            f"{persona_guidelines}\n\n"
            "Critique the following research statement or hypothesis. Use web search to find "
            "counter-arguments or similar failed hypotheses in the literature."
            "\n\nProvide:\n"
            "- A bulleted list of logical fallacies or gaps.\n"
            "- Identification of missing control variables or biases.\n"
            "- 3 alternative angles or competing hypotheses that must be addressed."
        )
        return await ToolLogic._run_agent(config, system_prompt, text, tavily_api_key)

    @staticmethod
    async def jargon(config: ProviderConfig, text: str, tavily_api_key: Optional[str] = None):
        system_prompt = (
            "You are a master of science communication. Translate dense academic text into plain English. "
            "Use web search to find the most intuitive real-world analogies for the complex concepts mentioned."
            "\n\nProvide:\n"
            "1. Plain-English Breakdown: An intuitive explanation.\n"
            "2. Real-World Analogy: A vivid analogy to make the concept stick."
        )
        return await ToolLogic._run_agent(config, system_prompt, text, tavily_api_key)


async def log_research(tool_name: str, input_text: str, output_text: str, provider: str, session_id: Optional[str] = None):
    """Logs a research interaction to the database and vector store.

    Args:
        tool_name: Name of the tool used (sifter, critique, jargon)
        input_text: The user's input text
        output_text: The tool's output
        provider: The LLM provider used
        session_id: Optional session ID. Defaults to 'default_session' if not provided.
    """
    db = SessionLocal()
    try:
        from .database import UserSession

        target_session = session_id or "default_session"

        # Ensure session exists
        session = db.query(UserSession).filter(UserSession.session_id == target_session).first()
        if not session:
            session = UserSession(session_id=target_session)
            db.add(session)
            db.commit()

        log = ResearchLog(
            session_id=target_session,
            tool_name=tool_name,
            input_text=input_text,
            output_text=output_text,
            provider=provider
        )
        db.add(log)
        db.commit()

        # Add to vector collection for search
        collection = get_vector_collection()
        collection.add(
            documents=[output_text],
            metadatas=[{"tool": tool_name, "provider": provider, "session_id": target_session}],
            ids=[f"log_{log.id}"]
        )
        logger.debug(f"Logged research: {tool_name} for session {target_session}")

    except Exception as e:
        logger.error(f"Database logging error: {str(e)}")
        # Don't re-raise - logging failure shouldn't break the main flow
    finally:
        db.close()
