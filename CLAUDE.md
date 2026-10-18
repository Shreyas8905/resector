# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and AI coding assistants working in this repository.

## Build and Run Commands

### Docker (Recommended - Compose services)
- Build and start: `docker-compose up --build`
- Stop while preserving data: `docker-compose stop` (or `docker-compose down`)
- View logs: `docker-compose logs -f`
- Remove persisted data: `docker-compose down -v` (**destructive**)

Compose runs separate `chroma`, `backend`, and `frontend` services. The backend
uses SQLite and persistent volumes for the database, uploaded documents, vector
data, and embedding-model cache. Access the app at `http://localhost:3000`;
the API is available at `http://localhost:8000`.

### Local Development (Without Docker)
**Infrastructure**
- The default database is SQLite at `.\user_data\resector.db`.
- ChromaDB runs embedded by default under `.\user_data\chroma`; set
  `CHROMA_MODE=http` to use a ChromaDB server.
- Optional local ChromaDB server: `chroma run --host localhost --port 5000 --path .\user_data\chroma`

**Backend (FastAPI)**
- Python virtual environment: `.\.venv\Scripts\python.exe` (or `python -m venv .venv`)
- Install dependencies: `cd backend && pip install -r requirements.txt`
- Run server: `uvicorn backend.main:app --reload --port 8000`

**Frontend (Next.js 16 / React 19)**
- Install dependencies: `cd frontend && npm install`
- Run development server: `npm run dev`
- Build for production / TypeScript check: `npm run build`

## Architecture & System Design

Resector is a local-first, privacy-preserving academic research workspace with a decoupled Frontend/Backend architecture. The default persistence layer is SQLite plus ChromaDB; external LLM and Tavily calls are optional and configured per user.

### Current System Capabilities
1. **50-Paper Interactive Citation Network & Community Graph**:
   - Multi-hop recursive citation/reference traversal (OpenAlex + Semantic Scholar + ArXiv/DOI + Tavily fallback).
   - Cross-citations and bibliographic coupling calculation generating 800+ interconnected chain links.
   - Louvain community detection assigning 4-8 thematic cluster colors with node importance and shortest-path graph proximity.
   - Interactive Canvas: D3-reheated titles/importance density sliders, layout switchers (Force Atlas, Clusters, Years), recenter, and GEXF export.
2. **Immersive Paper Chat & Grounded RAG Agent**:
   - Multi-document PDF indexing with background chunking and vector search in ChromaDB.
   - LangGraph ReAct agent loop capable of invoking local vector retrieval and Tavily live web search.
   - Session management: delete conversations, clear chat history, delete single messages, 1-click clipboard copy, and starter prompt templates.
   - Strict layout isolation: static pinned header and footer chat bar with independent message feed scrolling.
3. **Core Research Tools**:
   - **Methodology Sifter**: Structured extraction of questions, samples, methods, and limitations from text or PDF/TXT/MD uploads.
   - **Adversarial Critique**: 5-stage Persona Spectrum (Supportive Peer to Hostile Reviewer 2), available for text and document inputs.
   - **Jargon Simplifier**: Layered technical translation and intuitive analogies, available for text and document inputs.
   - **Document analysis pipeline**: Long-document chunking/condensation, reference stripping, provider-aware limits, bounded web search, duplicate-source removal, and validated inline citations.
   - **Research Archive**: Chronological search and filtering of past research interactions.

### Data Flow
- `Frontend (Next.js)` -> `Backend (FastAPI)` -> `LangGraph ReAct Agent Loop` -> `ChromaDB / Tavily / LLM Providers`
- `Graph Request` -> `backend/services/graph_service.py` -> `OpenAlex/S2 APIs + NetworkX Graph Algorithms` -> `React Force Graph 2D Canvas`
- `Document Tool Request` -> `backend/main.py` -> `PDF/text extraction and condensation` -> `LangGraph/Tavily-enabled analysis` -> `ResearchLog`

### Backend Modules (`backend/`)
- `main.py`: FastAPI endpoints using Depends-based DB session management, lifespan initialization, CORS with explicit origins, and structured logging. Endpoints include chat sessions/messages, multi-document uploads, document deletion, text/document analysis tools, archive search, and graph snapshots.
- `services/graph_service.py`: High-throughput academic paper resolver, multi-hop citation graph engine, bibliographic coupling, Louvain modularity clustering, and stable hashing for synthetic IDs.
- `services/rag_agent.py`: LangGraph ReAct agent with paper retrieval and Tavily search tools. Enum-based role comparison for chat history and retryable-only retry logic.
- `services/pdf_processor.py`: Async-safe PDF extraction (run_in_executor), text chunking, embedding generation into ChromaDB, with corrupt/password-protected PDF handling.
- `provider_factory.py`: Hot-swappable LLM adapters (Groq, OpenAI, Anthropic, Gemini) with Pydantic field validators for API key validation.
- `database.py`: SQLAlchemy 2.0 ORM over SQLite (WAL and foreign keys enabled), timezone-aware datetimes, cascade delete relationships, and embedded/HTTP ChromaDB client initialization.
- `tools.py`: Academic research tools (Sifter, Critique, Jargon), long-document map/merge processing, provider-aware retry handling, bounded Tavily search, and source validation.
- `config.py`: Environment settings with env var priority, local data/upload paths, embedding-model configuration, and rate-limit errors.

### Frontend Modules (`frontend/src/`)
- `app/page.tsx`: Main workspace dashboard with sidebar tool switcher and pinned viewport layout.
- `app/paper-chat/page.tsx`: Immersive paper chat interface with starter cards, multi-document session management, task progress polling, and citation graph toggle. Proper interval cleanup.
- `components/PaperGraphView.tsx`: Interactive 50-Paper canvas (ForceGraph2D, D3 physics, Louvain color-coded clusters, side drawer metadata, GEXF export).
- `components/DocumentPicker.tsx`: Shared PDF/TXT/MD picker for the Sifter, Critique, and Jargon tools.
- `components/SettingsDrawer.tsx`: User API key management for LLM and Tavily providers with guarded JSON.parse, Escape key close, and backdrop click-to-close.
- `components/ThemeToggle.tsx`: Synchronized dark/light mode toggle with SSR-safe mounting to prevent theme flash.
- `components/SifterTool.tsx`, `CritiqueTool.tsx`, `JargonTool.tsx`: Research tools supporting pasted text or document uploads, API key pre-validation, persona selection where applicable, loading states, and error display.
- `components/ResearchHistory.tsx`: Semantic search using GET endpoint with query params, pre-search and error states.
- `lib/documentApi.ts`: Multipart document upload client shared by the three analysis tools.

### Docker Setup
- `Dockerfile`: Backend image used by the API and ChromaDB Compose services.
- `docker-compose.yml`: Three-service deployment with ChromaDB, SQLite-backed FastAPI, and Next.js frontend, plus persistent volumes and health checks.
- `.dockerignore`: Build optimization excluding node_modules, `.next`, venv, and other local artifacts.
