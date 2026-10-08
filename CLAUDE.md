# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and AI coding assistants when working with code in this repository.

## Build and Run Commands

### Docker (Recommended)
- Build and start all services: `docker-compose up --build`
- Stop services: `docker-compose down`
- View logs: `docker-compose logs -f`

### Local Development
**Infrastructure**
- Run ChromaDB locally: `chroma run --host localhost --port 5000 --path .\chromadb`
- PostgreSQL (Database URL in `backend/.env`): `postgresql://postgres:postgres@localhost:5432/resector`

**Backend (FastAPI)**
- Python virtual environment: `.\.venv\Scripts\python.exe` (or `python -m venv .venv`)
- Install dependencies: `cd backend && pip install -r requirements.txt`
- Run server: `uvicorn backend.main:app --reload --port 8000`

**Frontend (Next.js 15+ / React 19)**
- Install dependencies: `cd frontend && npm install`
- Run development server: `npm run dev`
- Build for production / TypeScript check: `npm run build`

## Architecture & System Design

Resector is a local-first, privacy-preserving academic research workspace with a decoupled Frontend/Backend architecture.

### Latest System Capabilities
1. **50-Paper Interactive Citation Network & Community Graph**:
   - Multi-hop recursive citation/reference traversal (OpenAlex + Semantic Scholar + ArXiv/DOI + Tavily fallback).
   - Cross-citations & Bibliographic Coupling calculation generating 800+ interconnected chain links.
   - Louvain community detection assigning 4–8 thematic cluster colors with node importance and shortest-path graph proximity.
   - Interactive Canvas: D3-reheated titles/importance density sliders, layout switchers (Force Atlas, Clusters, Years), recenter, and GEXF export.
2. **Immersive Paper Chat & Grounded RAG Agent**:
   - Multi-document PDF indexing with background chunking and vector search in ChromaDB.
   - LangGraph ReAct agent loop capable of invoking local vector retrieval and Tavily live web search.
   - Session management: delete conversations, clear chat history, delete single messages, 1-click clipboard copy, and starter prompt templates.
   - Strict layout isolation: static pinned header and footer chat bar with independent message feed scrolling.
3. **Core Research Tools**:
   - **Methodology Sifter**: Structured extraction of questions, samples, methods, and limitations.
   - **Adversarial Critique**: 5-stage Persona Spectrum (Supportive Peer to Hostile Reviewer 2).
   - **Jargon Simplifier**: Layered technical translation and intuitive analogies.
   - **Research Archive**: Chronological search and filtering of past research interactions.

### Data Flow
- `Frontend (Next.js)` $\rightarrow$ `Backend (FastAPI)` $\rightarrow$ `LangGraph ReAct Agent Loop` $\rightarrow$ `ChromaDB / Tavily / LLM Providers`
- `Graph Request` $\rightarrow$ `backend/services/graph_service.py` $\rightarrow$ `OpenAlex/S2 APIs + NetworkX Graph Algorithms` $\rightarrow$ `React Force Graph 2D Canvas`

### Backend Modules (`backend/`)
- `main.py`: FastAPI endpoints for chat sessions, messages, PDF uploads, tools, and graph snapshots (`POST /api/graph/generate`, `DELETE /api/graph/session`, `DELETE /chat/sessions/{id}`).
- `services/graph_service.py`: High-throughput academic paper resolver, multi-hop citation graph engine, bibliographic coupling, and Louvain modularity clustering.
- `services/rag_agent.py`: LangGraph ReAct agent with paper retrieval and Tavily search tools.
- `services/pdf_processor.py`: PDF extraction, text chunking, and embedding generation into ChromaDB.
- `provider_factory.py`: Hot-swappable LLM adapters (Groq, OpenAI, Anthropic, Gemini).
- `database.py`: SQLAlchemy ORM (`UserSession`, `ChatMessage`, `Document`, `ResearchLog`, `GraphSnapshot`) + lazy ChromaDB client.
- `tools.py`: Academic research tools (Sifter, Critique, Jargon) and Tavily search logic.
- `config.py`: Environment settings and custom exceptions (`RateLimitError`).

### Frontend Modules (`frontend/src/`)
- `app/page.tsx`: Main workspace dashboard with sidebar tool switcher and pinned viewport layout.
- `app/paper-chat/page.tsx`: Immersive paper chat interface with starter cards, session management, and citation graph toggle.
- `components/PaperGraphView.tsx`: Interactive 50-Paper canvas (ForceGraph2D, D3 physics, Louvain color-coded clusters, side drawer metadata, GEXF export).
- `components/SettingsDrawer.tsx`: User API key management for LLM providers, Tavily, and Semantic Scholar stored in `localStorage`.
- `components/ThemeToggle.tsx`: Synchronized dark/light mode toggle adapting CSS variables and document classes.

