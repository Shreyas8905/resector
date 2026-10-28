from typing import List, Optional, Dict, Any
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, AIMessage
from langchain_core.tools import StructuredTool
from langgraph.prebuilt import create_react_agent
from ..provider_factory import ProviderFactory, ProviderConfig
from ..database import SessionLocal, ChatMessage, MessageRole, get_vector_collection
from ..tools import web_search
from ..config import RateLimitError
import asyncio
import logging
from langgraph.errors import GraphRecursionError
from .figure_tools import make_find_figures_tool, FIGURE_PROMPT
from .token_budget import (
    input_budget, make_prompt_hook, estimate_tokens, split_for_condense, truncate_text,
    is_too_large_error, learn_from_error, retry_after_seconds, fit_messages,
)

logger = logging.getLogger(__name__)


def is_rate_limit_error(exception):
    """Checks if an exception is a rate limit error from any provider."""
    error_msg = str(exception).lower()
    return "rate limit" in error_msg or "429" in error_msg or "too many requests" in error_msg


def is_retryable_error(exception):
    """Returns True only for retryable errors (rate limits, transient network errors)."""
    if is_rate_limit_error(exception):
        return True
    # Retry on transient network errors, not on auth/validation errors
    error_msg = str(exception).lower()
    return "timeout" in error_msg or "connection" in error_msg or "503" in error_msg or "502" in error_msg

class RAGAgent:
    def __init__(self, config: ProviderConfig, session_id: str):
        self.config = config
        self.session_id = session_id
        self.llm = ProviderFactory.get_llm(config)
        self.shrink = 1.0          # lowered after a "request too large" error
        self.notices: List[str] = []

    def _budget(self) -> int:
        return input_budget(self.config.provider, self.config.model_name, self.shrink)

    async def _condense_long_input(self, text: str) -> str:
        """A very long pasted message is condensed piece by piece so it fits one request."""
        from ..tools import ToolLogic
        target = int(self._budget() * 0.4)
        if estimate_tokens(text) <= target:
            return text
        original = text
        for _ in range(3):
            pieces = split_for_condense(text, int(self._budget() * 0.45))
            if len(pieces) > 12:
                pieces = pieces[:12]
                self.notices.append("only the first part of your very long message could be used")
            notes = []
            for piece in pieces:
                async def call(p=piece):
                    resp = await self.llm.ainvoke([
                        SystemMessage(content=USER_CONDENSE_PROMPT), HumanMessage(content=p)])
                    return ToolLogic._content_to_text(resp.content)
                notes.append(await ToolLogic._retry(call))
            text = "\n\n".join(notes)
            if estimate_tokens(text) <= target:
                break
        text = truncate_text(text, target)
        self.notices.append("your message was very long, so it was condensed before answering")
        logger.info("condensed user input from %d to %d tokens", estimate_tokens(original), estimate_tokens(text))
        return text

    def _get_paper_retrieval_tool(self):
        """Creates a tool that retrieves relevant chunks from papers in the session."""
        def retrieve(query: str):
            collection = get_vector_collection()
            # Filter by session_id to only get documents belonging to this research session
            results = collection.query(
                query_texts=[query],
                n_results=5,
                where={"session_id": self.session_id}
            )

            documents = results['documents'][0] if results['documents'] else []
            metadatas = results['metadatas'][0] if results['metadatas'] else []

            formatted_context = []
            # Keep one result well under the request budget so it is never cut off mid-passage.
            per_chunk = max(500, min(1500, int(self._budget() * 0.2 * 3.2 / max(1, len(documents)))))
            for doc, meta in zip(documents, metadatas):
                formatted_context.append(f"Source (Doc ID {meta.get('document_id')}): {doc[:per_chunk]}")

            return "\n\n".join(formatted_context) if formatted_context else "No relevant information found in the uploaded papers."

        return StructuredTool.from_function(
            name="paper_retrieval",
            func=retrieve,
            description="Retrieve specific information from the research papers uploaded to this session."
        )

    def _get_web_search_tool(self, tavily_api_key: str):
        """Wraps the existing web_search tool to inject the API key."""
        def search_with_key(query: str):
            return web_search.invoke({"query": query, "tavily_api_key": tavily_api_key})

        return StructuredTool.from_function(
            name="web_search",
            func=search_with_key,
            description="Search the web for external academic data, recent findings, or verification."
        )

    async def chat(self, user_input: str, history: List[BaseMessage], tavily_api_key: Optional[str] = None):
        # 1. Setup Tools
        tools = [limit_calls(self._get_paper_retrieval_tool(), 3)]
        if tavily_api_key:
            tools.append(limit_calls(self._get_web_search_tool(tavily_api_key), 2))

        # Figure search (charts, diagrams) bound to this session; DB session closed after the answer
        fig_db = SessionLocal()
        tools.append(limit_calls(make_find_figures_tool(fig_db, get_vector_collection(), self.session_id), 2))

        # 2. Create Agent. The prompt hook trims every model call to the provider's token limit.
        hook = make_prompt_hook(self._budget, overhead=350 * len(tools))
        agent_executor = create_react_agent(self.llm, tools, prompt=hook)

        # 3. System Prompt for Hybrid RAG
        system_message = (
            "You are a professional research companion. You have access to the user's uploaded papers "
            "via 'paper_retrieval' and the broader web via 'web_search'.\n\n"
            "GUIDELINES:\n"
            "1. Always check the uploaded papers first using 'paper_retrieval'.\n"
            "2. If the paper does not contain the answer, use 'web_search' to supplement the information.\n"
            "3. If you use a paper, cite it as [Paper Doc ID X]. If you use the web, cite it as [Web Source URL].\n"
            "4. Maintain a professional, academic tone. Synthesize information across multiple papers if applicable.\n"
            "5. Be precise. If the information is not available in either source, state it clearly."
        ) + FIGURE_PROMPT

        # 4. Prepare Input (System Prompt + History + New Message)
        try:
            user_input = await self._condense_long_input(user_input)
            messages = [SystemMessage(content=system_message)] + history + [HumanMessage(content=user_input)]

            # 5. Invoke Agent with Retry Logic
            answer = await self._invoke_agent_with_retry(agent_executor, messages)
            if self.notices:
                answer = f"{answer}\n\n*Note: {'; '.join(dict.fromkeys(self.notices))}.*"
            return answer
        except Exception as e:
            if is_rate_limit_error(e) or is_too_large_error(e):
                raise RateLimitError(
                    "This request is larger than your model provider allows right now. "
                    "Try again in a minute, ask about a narrower topic, or switch to a model with a higher limit. "
                    f"(Details: {str(e)[:300]})")
            raise e
        finally:
            fig_db.close()

    async def _answer_from_gathered(self, messages) -> str:
        """The agent kept searching. Answer once, without tools, from the evidence already retrieved."""
        question = next((m for m in reversed(messages) if m.type == "human"), None)
        system = next((m for m in messages if m.type == "system"), None)
        evidence = "\n\n".join(ToolContent.text(m.content) for m in messages
                                if m.type == "tool" and ToolContent.text(m.content) != LIMIT_REACHED)
        prompt = [
            SystemMessage(content=(ToolContent.text(system.content) if system else "")
                          + "\n\nNo more searching is possible. Answer using only the material provided, "
                            "cite it as instructed, and say plainly what it does not cover."),
            HumanMessage(content=f"{ToolContent.text(question.content) if question else ''}\n\n"
                                 f"--- MATERIAL RETRIEVED SO FAR ---\n{evidence or '(nothing relevant was found)'}"),
        ]
        resp = await self.llm.ainvoke(fit_messages(prompt, self._budget()))
        self.notices.append("the search took more steps than allowed, so this answer uses what was found so far")
        return ToolContent.text(resp.content)

    async def _invoke_agent_with_retry(self, agent_executor, messages):
        """Retries rate limits (waiting as long as the provider asks) and shrinks the request when the
        provider says it is too large."""
        last = None
        for attempt in range(6):
            try:
                state = {"messages": messages}
                try:
                    async for state in agent_executor.astream(
                            {"messages": messages}, config={"recursion_limit": 25}, stream_mode="values"):
                        pass
                except GraphRecursionError:
                    logger.warning("Agent hit the step limit; answering from what it gathered")
                    return await self._answer_from_gathered(state["messages"])
                return ToolContent.text(state["messages"][-1].content)
            except Exception as e:
                last = e
                if is_too_large_error(e):
                    learned = learn_from_error(self.config.provider, self.config.model_name, str(e))
                    self.shrink *= 0.75
                    logger.warning("Request too large (provider limit %s); retrying with budget %d tokens",
                                   learned, self._budget())
                    if self._budget() <= 800:
                        raise
                    continue
                if is_rate_limit_error(e) or is_retryable_error(e):
                    wait = retry_after_seconds(e, default=min(2 ** (attempt + 1), 20))
                    logger.info("Provider busy; waiting %.0fs (attempt %d)", wait, attempt + 1)
                    await asyncio.sleep(wait)
                    continue
                raise
        raise last


LIMIT_REACHED = ("Tool limit reached. Do not call this tool again. "
                 "Write your final answer now using the information you already have.")


def limit_calls(tool, max_calls: int):
    """Wrap a tool so it stops answering after max_calls. Without this a model that finds the first
    result incomplete can keep searching until the step limit is hit."""
    count = {"n": 0}
    fn = tool.func

    def wrapped(query: str):
        if count["n"] >= max_calls:
            return LIMIT_REACHED
        count["n"] += 1
        return fn(query)

    return StructuredTool.from_function(
        func=wrapped, name=tool.name, description=tool.description, args_schema=tool.args_schema)


class ToolContent:
    @staticmethod
    def text(content) -> str:
        """Some providers return a list of content blocks instead of a string."""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return "".join(b if isinstance(b, str) else b.get("text", "")
                           for b in content if isinstance(b, str) or (isinstance(b, dict) and b.get("type") == "text"))
        return str(content)


USER_CONDENSE_PROMPT = (
    "You are shortening a long message so another assistant can answer it. Keep the user's actual question or "
    "instructions word for word if present. Condense everything else into dense bullet points that keep names, "
    "numbers, definitions, claims and quoted wording. Add nothing new. At most 300 words."
)


async def get_chat_history(session_id: str) -> List[BaseMessage]:
    """Retrieves chat history from DB and converts it to LangChain messages."""
    db = SessionLocal()
    try:
        messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
        langchain_msgs = []
        for msg in messages:
            # Fix: Compare enum to enum, not string
            if msg.role == MessageRole.USER:
                langchain_msgs.append(HumanMessage(content=msg.content))
            elif msg.role == MessageRole.ASSISTANT:
                langchain_msgs.append(AIMessage(content=msg.content))
            else:
                langchain_msgs.append(SystemMessage(content=msg.content))
        return langchain_msgs
    finally:
        db.close()

async def save_chat_message(session_id: str, role: str, content: str, citations: Optional[str] = None):
    """Saves a chat message to the database."""
    db = SessionLocal()
    try:
        msg = ChatMessage(
            session_id=session_id,
            role=MessageRole[role.upper()],
            content=content,
            citations=citations
        )
        db.add(msg)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error saving chat message: {str(e)}")
        raise
    finally:
        db.close()
