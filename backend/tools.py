from typing import Any, Dict, Optional, List, Annotated
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain.tools import tool
from langchain_core.tools import Tool
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent
from tavily import TavilyClient
from pydantic import BaseModel

from .provider_factory import ProviderFactory, ProviderConfig
from .database import SessionLocal, ResearchLog, get_vector_collection

# --- Request/Response Models ---

class ResearchRequest(BaseModel):
    text: str
    provider: str
    api_key: str
    tavily_api_key: Optional[str] = None
    model_name: Optional[str] = None
    severity: Optional[str] = "constructive" # For critique tool

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
    tavily = TavilyClient(api_key=tavily_api_key)
    response = tavily.search(query=query, search_depth="advanced", max_results=5)

    results = []
    for res in response['results']:
        results.append(f"Source: {res['url']}\nContent: {res['content']}")

    return "\n\n".join(results)

# --- Core Logic ---

class ToolLogic:
    @staticmethod
    async def _run_agent(config: ProviderConfig, system_prompt: str, user_input: str, tavily_api_key: Optional[str] = None):
        llm = ProviderFactory.get_llm(config)

        # Only provide the search tool if a key is available
        tools = []
        if tavily_api_key:
            # We wrap the search tool to automatically inject the API key
            def search_with_key(query: str):
                return web_search.invoke({"query": query, "tavily_api_key": tavily_api_key})

            # Re-define as a tool for the agent
            tools.append(Tool(
                name="web_search",
                func=search_with_key,
                description="Search the web for academic papers, recent findings, and factual data."
            ))

        agent_executor = create_react_agent(llm, tools)

        full_system_message = (
            f"{system_prompt}\n\n"
            "IMPORTANT GUIDELINES:\n"
            f"1. {'Use the web_search tool to verify facts and find recent papers.' if tools else 'Search is disabled (no API key). Use internal knowledge.'}\n"
            "2. You MUST provide inline citations using [1], [2], etc., corresponding to the sources you find.\n"
            "3. You MUST end your response with a 'Sources' section listing all URLs used in the citations."
        )

        inputs = {"messages": [SystemMessage(content=full_system_message), HumanMessage(content=user_input)]}
        result = await agent_executor.ainvoke(inputs)
        return result["messages"][-1].content

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

async def log_research(tool_name: str, input_text: str, output_text: str, provider: str):
    db = SessionLocal()
    try:
        from .database import UserSession
        session = db.query(UserSession).filter(UserSession.session_id == "default_session").first()
        if not session:
            session = UserSession(session_id="default_session")
            db.add(session)
            db.commit()

        log = ResearchLog(
            session_id="default_session",
            tool_name=tool_name,
            input_text=input_text,
            output_text=output_text,
            provider=provider
        )
        db.add(log)
        db.commit()

        collection = get_vector_collection()
        collection.add(
            documents=[output_text],
            metadatas=[{"tool": tool_name, "provider": provider}],
            ids=[f"log_{log.id}"]
        )
    except Exception as e:
        print(f"Database logging error: {str(e)}")
    finally:
        db.close()
