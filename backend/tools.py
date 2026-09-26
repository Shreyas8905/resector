from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from typing import Optional, List
from .provider_factory import ProviderFactory, ProviderConfig
from .database import SessionLocal, ResearchLog, get_vector_collection
from datetime import datetime

class ResearchRequest(BaseModel):
    text: str
    provider: str
    api_key: str
    model_name: Optional[str] = None
    severity: Optional[str] = "constructive" # For critique tool

class ResearchResponse(BaseModel):
    output: str
    provider: str

class ToolLogic:
    @staticmethod
    async def sifter(config: ProviderConfig, text: str):
        llm = ProviderFactory.get_llm(config)
        prompt = f"""
        You are an expert academic research assistant. Analyze the following research abstract or snippet and extract exactly 4 checkpoints:
        1. Core Research Question: What is the primary goal?
        2. Methodology & Sample Size: How was the research conducted?
        3. Key Findings/Metrics: What were the concrete results?
        4. Fatal Flaws or Limitations: What are the critical weaknesses?

        Format the output as a structured markdown list.

        Input:
        {text}
        """
        response = await llm.ainvoke(prompt)
        return response.content

    @staticmethod
    async def critique(config: ProviderConfig, text: str, severity: str):
        llm = ProviderFactory.get_llm(config)

        severity_map = {
            "constructive": "Act as a supportive but critical colleague. Provide helpful, constructive feedback to improve the work.",
            "brutal": "Act as Reviewer #2. Be intellectually ruthless. Identify every logical gap, missing variable, and flaw with surgical precision."
        }

        persona = severity_map.get(severity, severity_map["constructive"])

        prompt = f"""
        {persona}

        Critique the following research statement or hypothesis:
        {text}

        Provide:
        - A bulleted list of logical fallacies or gaps.
        - Identification of missing control variables or biases.
        - 3 alternative angles or competing hypotheses that must be addressed.
        """
        response = await llm.ainvoke(prompt)
        return response.content

    @staticmethod
    async def jargon(config: ProviderConfig, text: str):
        llm = ProviderFactory.get_llm(config)
        prompt = f"""
        You are a master of science communication. Translate the following dense academic text into plain English.

        1. Plain-English Breakdown: Explain the core concept so a high-school student can understand.
        2. Real-World Analogy: Provide a vivid, intuitive analogy to make the concept stick.

        Input:
        {text}
        """
        response = await llm.ainvoke(prompt)
        return response.content

async def log_research(tool_name: str, input_text: str, output_text: str, provider: str):
    db = SessionLocal()
    try:
        # Ensure the default session exists before logging
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

        # Also index in ChromaDB for semantic search
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
