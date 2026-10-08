# Resector: Local-First Research Companion

Resector is an advanced, local-first research assistant designed to transform how researchers interact with academic papers and the web. By combining a decoupled Frontend/Backend architecture with agentic RAG (Retrieval-Augmented Generation), Resector enables users to conduct deep-dive research with high precision, inline citations, and customizable AI personas.

## 🚀 Key Features

- **Agentic Research Loop**: Unlike standard chatbots, Resector uses a ReAct agent pattern. It doesn't just answer; it decides when to search the web, when to critique its own findings, and when to refine its search queries.
- **Chat with Paper**: A specialized RAG pipeline that allows users to upload academic PDFs and engage in a contextual dialogue with the document.
- **Persona Spectrum (Critique Tool)**: A unique 5-stage persona map that allows the AI to shift its critical tone—from supportive feedback to rigorous academic critique.
- **Semantic Memory**: Dual-persistence storage using PostgreSQL for relational logs and ChromaDB for vector-based semantic retrieval, allowing users to "remember" past findings across different sessions.
- **Internet-Integrated Search**: Built-in integration with Tavily Search to ensure research is grounded in real-time web data.
- **High-Contrast Academic UI**: A Next.js frontend designed for readability and focus, featuring a high-contrast theme and markdown rendering for academic output.

---

## 🏗️ Architecture

Resector follows a decoupled architecture to ensure scalability and separation of concerns.

### Data Flow
`Frontend (Next.js)` $\rightarrow$ `Backend (FastAPI)` $\rightarrow$ `LangGraph Agent Loop` $\rightarrow$ `Tavily Search/LLM API`

### System Components
1. **Frontend**: A modern React application handling the user interface, API key management (via localStorage), and academic rendering.
2. **Backend**: A FastAPI orchestrator that manages the agentic logic and interfaces with the LLM providers.
3. **Vector Store**: ChromaDB stores embeddings of research logs and uploaded papers for semantic search.
4. **Relational Store**: PostgreSQL manages structured logs and user-related data.

---

## 📂 File Directory & Purpose

### 📁 Root
- `docker-compose.yml`: Orchestrates the deployment of the Frontend, Backend, and Database services.
- `CLAUDE.md`: Development guidelines and quick-start commands for AI assistants.
- `PROJECT.md`: High-level project overview and architecture.

### 📁 backend/
- `main.py`: The entry point of the FastAPI application; defines API endpoints.
- `config.py`: Centralized environment variable and configuration management.
- `database.py`: Handles connections and operations for PostgreSQL and ChromaDB.
- `provider_factory.py`: A factory pattern implementation for swapping LLM providers (Groq, OpenAI, Anthropic, Gemini).
- `tools.py`: Defines the agentic tools (Sifter, Critique, Jargon) that the LLM can invoke.
- `requirements.txt`: Python dependencies.
- **📁 services/**
    - `rag_agent.py`: The core logic for the agentic RAG loop and LangGraph orchestration.
    - `pdf_processor.py`: Handles PDF parsing, text extraction, and embedding generation.

### 📁 frontend/
- `package.json`: Node.js dependencies and scripts.
- `next.config.ts`: Configuration for the Next.js framework.
- **📁 src/**
    - **📁 app/**
        - `page.tsx`: The main research dashboard.
        - `layout.tsx`: Root layout and global providers.
        - `globals.css`: Global styles and high-contrast theme definitions.
        - **📁 paper-chat/**: Contains the specialized interface for chatting with uploaded PDFs.
    - **📁 components/**
        - `SifterTool.tsx`: UI for the Sifter (information filtering) tool.
        - `CritiqueTool.tsx`: UI for the Persona-based critique tool.
        - `JargonTool.tsx`: UI for simplifying complex academic jargon.
        - `ResearchHistory.tsx`: Interface for browsing past research logs.
        - `SettingsDrawer.tsx`: Side-panel for managing API keys and preferences.
        - `ToolUI.tsx`: Generic wrapper for agent tool interactions.
        - `ThemeToggle.tsx`: Switch between light and high-contrast dark themes.
