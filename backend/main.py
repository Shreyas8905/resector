from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
from .database import init_db, SessionLocal, ResearchLog, get_vector_collection
from .tools import ToolLogic, ResearchRequest, ResearchResponse, log_research
from .provider_factory import ProviderConfig, ProviderFactory
from .config import settings
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="Resector Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ValidateKeyRequest(BaseModel):
    provider: str
    api_key: str
    model_name: Optional[str] = None

@app.post("/validate-key")
async def validate_key(req: ValidateKeyRequest):
    try:
        config = ProviderConfig(provider=req.provider, api_key=req.api_key, model_name=req.model_name)
        llm = ProviderFactory.get_llm(config)
        # Simple ainvoke to test the connection
        await llm.ainvoke("Ping")
        return {"valid": True, "message": "API key is valid"}
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid API key for {req.provider}: {str(e)}")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "database": settings.DATABASE_URL}

@app.post("/process/sifter", response_model=ResearchResponse)
async def process_sifter(req: ResearchRequest):
    config = ProviderConfig(provider=req.provider, api_key=req.api_key, model_name=req.model_name)
    try:
        output = await ToolLogic.sifter(config, req.text)
        await log_research("sifter", req.text, output, req.provider)
        return ResearchResponse(output=output, provider=req.provider)
    except Exception as e:
        # Log the error to console for the developer
        print(f"ERROR in sifter: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process/critique", response_model=ResearchResponse)
async def process_critique(req: ResearchRequest):
    config = ProviderConfig(provider=req.provider, api_key=req.api_key, model_name=req.model_name)
    try:
        output = await ToolLogic.critique(config, req.text, req.severity)
        await log_research("critique", req.text, output, req.provider)
        return ResearchResponse(output=output, provider=req.provider)
    except Exception as e:
        print(f"ERROR in critique: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process/jargon", response_model=ResearchResponse)
async def process_jargon(req: ResearchRequest):
    config = ProviderConfig(provider=req.provider, api_key=req.api_key, model_name=req.model_name)
    try:
        output = await ToolLogic.jargon(config, req.text)
        await log_research("jargon", req.text, output, req.provider)
        return ResearchResponse(output=output, provider=req.provider)
    except Exception as e:
        print(f"ERROR in jargon: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search")
async def search_research(request: dict):
    query = request.get("query", "")
    if not query:
        raise HTTPException(status_code=400, detail="Query required")

    try:
        collection = get_vector_collection()
        results = collection.query(
            query_texts=[query],
            n_results=5
        )

        formatted_results = []
        for i in range(len(results['documents'][0])):
            doc = results['documents'][0][i]
            meta = results['metadatas'][0][i]
            formatted_results.append({
                "content": doc,
                "tool": meta.get("tool", "unknown"),
                "date": "Recent"
            })

        return {"results": formatted_results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.on_event("startup")
async def startup_event():
    init_db()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
