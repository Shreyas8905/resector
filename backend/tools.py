from typing import Any, Dict, Optional, List, Annotated
from langchain.tools import tool
from langchain_core.tools import Tool
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel
import logging
import asyncio
import re
from langchain_text_splitters import RecursiveCharacterTextSplitter
from .config import settings, RateLimitError

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

class DocumentTooLongError(ValueError):
    pass


HEAD_CHARS = 2500
MAP_PROMPT = (
    "You are condensing one section of an academic paper into dense notes for a later analysis. "
    "Keep: research questions, hypotheses, methods, datasets, sample sizes, metrics, exact numeric results, "
    "key claims, assumptions, stated limitations, and defined terms. Drop boilerplate, acknowledgements and "
    "citation lists. Use terse bullet points, at most 250 words. Do not add commentary or outside knowledge."
)

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
        
    @staticmethod
    def _strip_references(text: str) -> str:
        matches = list(re.finditer(r"^\s*(references|bibliography)\s*$", text, re.IGNORECASE | re.MULTILINE))
        for m in reversed(matches):
            if m.start() > len(text) * 0.5:
                return text[:m.start()]
        return text

    @staticmethod
    async def _retry(fn):
        """Retries on provider rate limits, waiting as long as the provider asks. Oversized requests are not retried."""
        last_err = None
        for _ in range(6):
            try:
                return await fn()
            except Exception as e:
                msg = str(e).lower()
                if "request too large" in msg or "error code: 413" in msg:
                    raise
                if not ("rate limit" in msg or "429" in msg or "tokens per minute" in msg or "too many requests" in msg):
                    raise
                last_err = e
                m = re.search(r"try again in ([\d.]+)\s*(ms|s)\b", msg)
                wait = (float(m.group(1)) / (1000 if m.group(2) == "ms" else 1) + 1) if m else 20
                logger.info(f"Rate limited; waiting {wait:.0f}s")
                await asyncio.sleep(min(wait, 65))
        raise RateLimitError(f"Rate limit still exceeded after several retries: {last_err}")

    @staticmethod
    async def _condense(llm, text: str) -> str:
        async def call():
            resp = await llm.ainvoke([SystemMessage(content=MAP_PROMPT), HumanMessage(content=text)])
            return ToolLogic._content_to_text(resp.content)
        return await ToolLogic._retry(call)

    @staticmethod
    async def run_document(tool: str, config: ProviderConfig, text: str, filename: str,
                           severity: str = "constructive_colleague", tavily_api_key: Optional[str] = None):
        budget = settings.TOOL_CHAR_BUDGET or (14000 if config.provider == "groq" else 60000)
        text = ToolLogic._strip_references(text).strip()
        if not text:
            raise ValueError("The document contains no readable text")

        async def run_tool(t: str, tavily: Optional[str]):
            if tool == "sifter":
                return await ToolLogic.sifter(config, t, tavily)
            if tool == "critique":
                return await ToolLogic.critique(config, t, severity, tavily)
            return await ToolLogic.jargon(config, t, tavily)

        # Short enough: run the tool directly
        if len(text) <= budget:
            return await ToolLogic._retry(lambda: run_tool(text, tavily_api_key))

        chunks = RecursiveCharacterTextSplitter(chunk_size=budget, chunk_overlap=300).split_text(text)
        if len(chunks) > settings.TOOL_MAX_PARTS:
            raise DocumentTooLongError(
                f"Document is too long ({len(chunks)} parts, limit {settings.TOOL_MAX_PARTS}). "
                "Upload a shorter excerpt or raise TOOL_MAX_PARTS."
            )

        # Jargon: translate each part, then stitch
        if tool == "jargon":
            parts = []
            for i, chunk in enumerate(chunks, 1):
                logger.info(f"jargon: part {i}/{len(chunks)} of {filename}")
                out = await ToolLogic._retry(lambda c=chunk: run_tool(c, None))
                parts.append(f"### Part {i} of {len(chunks)}\n\n{out}")
            return "\n\n".join(parts)

        # Sifter / Critique: condense every part, then analyze the whole
        llm = ProviderFactory.get_llm(config)
        notes = []
        for i, chunk in enumerate(chunks, 1):
            logger.info(f"{tool}: condensing part {i}/{len(chunks)} of {filename}")
            notes.append(await ToolLogic._condense(llm, chunk))
        combined = "\n\n".join(notes)

        merger = RecursiveCharacterTextSplitter(chunk_size=budget, chunk_overlap=0)
        for _ in range(3):
            if len(combined) <= budget - HEAD_CHARS:
                break
            logger.info(f"{tool}: merging notes for {filename}")
            combined = "\n\n".join([await ToolLogic._condense(llm, p) for p in merger.split_text(combined)])
        combined = combined[: max(budget - HEAD_CHARS, 2000)]

        user_input = (
            f"Document: {filename}\n"
            "The paper was too long to read at once. Below are its opening text (title and abstract) "
            "followed by condensed notes from every part of the paper. Analyze the whole paper from these.\n\n"
            f"--- OPENING TEXT ---\n{text[:HEAD_CHARS]}\n\n--- CONDENSED NOTES ---\n{combined}"
        )
        return await ToolLogic._retry(lambda: run_tool(user_input, tavily_api_key))


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
