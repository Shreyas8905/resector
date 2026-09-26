# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Run Commands

### Docker (Recommended)
- Build and start all services: `docker-compose up --build`
- Stop services: `docker-compose down`
- View logs: `docker-compose logs -f`

### Local Development
**Backend (FastAPI)**
- Install dependencies: `cd backend && pip install -r requirements.txt`
- Run server: `uvicorn main:app --reload --port 8000`

**Frontend (Next.js)**
- Install dependencies: `cd frontend && npm install`
- Run development server: `npm run dev`
- Build for production: `npm run build`

## High-Level Architecture

Resector is a local-first research companion using a decoupled Frontend/Backend architecture orchestrated via Docker.

### Data Flow
`Frontend (Next.js)` $\rightarrow$ `Backend (FastAPI)` $\rightarrow$ `LangChain/LangGraph` $\rightarrow$ `LLM Provider API`

### Component Breakdown
- **Frontend**: Next.js (App Router) with a minimalist, high-contrast theme. Uses `localStorage` to store AI provider configurations and API keys, passing them dynamically to the backend.
- **Backend**: FastAPI service acting as the orchestrator.
    - `provider_factory.py`: Implements a factory pattern to swap between LLM providers (Groq, OpenAI, Anthropic, Gemini).
    - `tools.py`: Contains the core academic logic chains (Sifter, Critique, Jargon).
    - `database.py`: Manages dual-persistence:
        - **PostgreSQL**: Relational storage for research logs and session history.
        - **ChromaDB**: Vector storage for semantic search and embedding research snippets.

### Key Patterns
- **Provider Hot-Swapping**: LLM providers are not hardcoded; the `ProviderFactory` instantiates the correct LangChain chat model based on the request payload.
- **Hybrid Storage**: Relational data (logs) is mirrored into a vector space (embeddings) in ChromaDB to enable semantic retrieval of past research.
