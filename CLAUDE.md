# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Run Commands

### Docker (Recommended)
- Build and start all services: `docker-compose up --build`
- Stop services: `docker-compose down`
- View logs: `docker-compose logs -f`

### Local Development
**Infrastructure**
- Run ChromaDB locally: `docker run -p 5000:8000 chromadb/chroma`

**Backend (FastAPI)**
- Install dependencies: `cd backend && pip install -r requirements.txt`
- Run server: `uvicorn main:app --reload --port 8000`

**Frontend (Next.js)**
- Install dependencies: `cd frontend && npm install`
- Run development server: `npm run dev`
- Build for production: `npm run build`

## High-Level Architecture

Resector is a local-first research companion using a decoupled Frontend/Backend architecture.

### Data Flow
`Frontend (Next.js)` $\rightarrow$ `Backend (FastAPI)` $\rightarrow$ `LangGraph Agent Loop` $\rightarrow$ `Tavily Search/LLM API`

### Component Breakdown
- **Frontend**: Next.js (App Router) with high-contrast theme. Uses `localStorage` for API keys and `react-markdown` for academic output rendering.
- **Backend**: FastAPI orchestrator using a ReAct agent pattern.
    - `provider_factory.py`: Hot-swappable LLM providers (Groq, OpenAI, Anthropic, Gemini).
    - `tools.py`: Agentic logic chains (Sifter, Critique, Jargon) integrated with Tavily Search.
    - `config.py`: Centralized environment and setting management.
    - `database.py`: Dual-persistence using PostgreSQL (relational logs) and ChromaDB (semantic vectors).

### Key Patterns
- **Agentic RAG**: Instead of simple prompts, tools use an agent loop that decides when to search the web and mandates inline citations.
- **Persona Spectrum**: The Critique tool uses a 5-stage persona map to shift the AI's critical tone.
- **Hybrid Storage**: Research logs are mirrored into ChromaDB to enable natural language retrieval of past findings.
