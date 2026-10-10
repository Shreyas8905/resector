# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and AI coding assistants when working with code in this repository.

## Build and Run Commands

### Docker (Recommended — Single Container)
- Build and start: `docker-compose up --build`
- Stop: `docker-compose down`
- View logs: `docker-compose logs -f`
- Clean up volumes: `docker-compose down -v`

The single-container setup (`Dockerfile.all-in-one`) runs PostgreSQL, ChromaDB, FastAPI backend, and Next.js frontend inside one container managed by `supervisord`. Access the app at `http://localhost:3000`.

### Local Development (Without Docker)
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
- `Frontend (Next.js)` → `Backend (FastAPI)` → `LangGraph ReAct Agent Loop` → `ChromaDB / Tavily / LLM Providers`
- `Graph Request` → `backend/services/graph_service.py` → `OpenAlex/S2 APIs + NetworkX Graph Algorithms` → `React Force Graph 2D Canvas`

### Backend Modules (`backend/`)
- `main.py`: FastAPI endpoints using Depends-based DB session management, lifespan event handler, CORS with explicit origins, and proper logging. Endpoints: chat sessions, messages, PDF uploads, tools, and graph snapshots.
- `services/graph_service.py`: High-throughput academic paper resolver, multi-hop citation graph engine, bibliographic coupling, Louvain modularity clustering, and stable hashing for synthetic IDs.
- `services/rag_agent.py`: LangGraph ReAct agent with paper retrieval and Tavily search tools. Enum-based role comparison for chat history, retryable-only retry logic.
- `services/pdf_processor.py`: Async-safe PDF extraction (run_in_executor), text chunking, embedding generation into ChromaDB, with corrupt/password-protected PDF handling.
- `provider_factory.py`: Hot-swappable LLM adapters (Groq, OpenAI, Anthropic, Gemini) with Pydantic field validators for API key validation.
- `database.py`: SQLAlchemy 2.0 ORM (DeclarativeBase, timezone-aware datetimes), thread-safe ChromaDB client singleton, cascade delete relationships.
- `tools.py`: Academic research tools (Sifter, Critique, Jargon) and Tavily search logic with proper logging and session-aware research logging.
- `config.py`: Environment settings with env var priority and custom exceptions (`RateLimitError`).

### Frontend Modules (`frontend/src/`)
- `app/page.tsx`: Main workspace dashboard with sidebar tool switcher and pinned viewport layout.
- `app/paper-chat/page.tsx`: Immersive paper chat interface with starter cards, session management, and citation graph toggle. Proper interval cleanup.
- `components/PaperGraphView.tsx`: Interactive 50-Paper canvas (ForceGraph2D, D3 physics, Louvain color-coded clusters, side drawer metadata, GEXF export).
- `components/SettingsDrawer.tsx`: User API key management with guarded JSON.parse, Escape key close, and backdrop click-to-close.
- `components/ThemeToggle.tsx`: Synchronized dark/light mode toggle with SSR-safe mounting to prevent theme flash.
- `components/SifterTool.tsx`, `CritiqueTool.tsx`, `JargonTool.tsx`: Research tools with API key pre-validation and error display.
- `components/ResearchHistory.tsx`: Semantic search using GET endpoint with query params, pre-search and error states.

### Docker Setup
- `Dockerfile.all-in-one`: Single container with PostgreSQL 15, ChromaDB, Python backend, Node.js frontend.
- `supervisord.conf`: Process manager starting services in order (PostgreSQL → ChromaDB → Backend → Frontend).
- `docker-compose.yml`: Single-service compose file with volume persistence and health checks.
- `.dockerignore`: Build optimization excluding node_modules, .next, venv, etc.
