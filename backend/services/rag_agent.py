from typing import List, Optional, Dict, Any
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, AIMessage
from langchain_core.tools import Tool
from langgraph.prebuilt import create_react_agent
from ..provider_factory import ProviderFactory, ProviderConfig
from ..database import SessionLocal, ChatMessage, get_vector_collection
from ..tools import web_search
import uuid

class RAGAgent:
    def __init__(self, config: ProviderConfig, session_id: str):
        self.config = config
        self.session_id = session_id
        self.llm = ProviderFactory.get_llm(config)

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
            for doc, meta in zip(documents, metadatas):
                formatted_context.append(f"Source (Doc ID {meta.get('document_id')}): {doc}")

            return "\n\n".join(formatted_context) if formatted_context else "No relevant information found in the uploaded papers."

        return Tool(
            name="paper_retrieval",
            func=retrieve,
            description="Retrieve specific information from the research papers uploaded to this session."
        )

    def _get_web_search_tool(self, tavily_api_key: str):
        """Wraps the existing web_search tool to inject the API key."""
        def search_with_key(query: str):
            return web_search.invoke({"query": query, "tavily_api_key": tavily_api_key})

        return Tool(
            name="web_search",
            func=search_with_key,
            description="Search the web for external academic data, recent findings, or verification."
        )

    async def chat(self, user_input: str, history: List[BaseMessage], tavily_api_key: Optional[str] = None):
        # 1. Setup Tools
        tools = [self._get_paper_retrieval_tool()]
        if tavily_api_key:
            tools.append(self._get_web_search_tool(tavily_api_key))

        # 2. Create Agent
        agent_executor = create_react_agent(self.llm, tools)

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
        )

        # 4. Prepare Input (System Prompt + History + New Message)
        messages = [SystemMessage(content=system_message)] + history + [HumanMessage(content=user_input)]

        # 5. Invoke Agent
        result = await agent_executor.ainvoke({"messages": messages})
        return result["messages"][-1].content

async def get_chat_history(session_id: str) -> List[BaseMessage]:
    """Retrieves chat history from DB and converts it to LangChain messages."""
    db = SessionLocal()
    try:
        messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
        langchain_msgs = []
        for msg in messages:
            if msg.role == "user":
                langchain_msgs.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
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
        from ..database import ChatMessage, MessageRole
        msg = ChatMessage(
            session_id=session_id,
            role=MessageRole[role.upper()],
            content=content,
            citations=citations
        )
        db.add(msg)
        db.commit()
    finally:
        db.close()
