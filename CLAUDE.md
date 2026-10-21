# CLAUDE.md

Repository guidance for coding assistants working on ReSector.

## Product status

ReSector's current product is a Tauri 2 desktop application. The public beta
release is [`v0.1.0-beta.1`](https://github.com/Shreyas8905/resector/releases/tag/v0.1.0-beta.1),
published October 21, 2026, with a Windows x64 installer. The desktop app
packages a PyInstaller FastAPI sidecar and a static Next.js export. Browser and
Docker workflows remain useful for development.

The application is local-first:

- Desktop data is stored under the platform app-data directory.
- SQLite is the default relational database.
- ChromaDB is embedded by default in the desktop sidecar.
- External LLM, Tavily, OpenAlex, Semantic Scholar, and DOI services are
  optional network integrations.
- Never commit API keys, `.env` files, uploads, databases, vector stores, or
  build artifacts.

## Build and run commands

### Desktop packaging

Prerequisites: Node.js 20+, Python 3.12, Rust via rustup, and platform build
dependencies. Windows builds also require Microsoft C++ Build Tools and
WebView2.

Run these commands from the repository root on Windows:

```powershell
python -m venv .venv-desktop
.\.venv-desktop\Scripts\Activate.ps1
pip install -r desktop\sidecar\requirements-desktop.txt
python desktop\scripts\build_backend.py

Set-Location desktop
npm install
npm run build:frontend
npm run tauri build
```

The complete packaging shortcut is:

```powershell
Set-Location desktop
npm run package
```

Artifacts are written to `desktop\src-tauri\target\release\bundle\`.
Build installers on the target operating system.

### Desktop development

```powershell
Set-Location desktop
npm run dev
```

This runs the Tauri shell with the locally built backend/frontend resources.
For UI-only development against the normal Next.js server:

```powershell
Set-Location frontend
npm run dev

# In another terminal
$env:RESECTOR_DEV_URL = "http://localhost:3000"
Set-Location desktop
npm run dev
```

The desktop shell prefers port `47821` and selects a local fallback if that
port is occupied. `RESECTOR_DEV_URL` skips sidecar startup and navigates the
webview to the specified development URL.

### Browser/Docker development

```bash
docker compose up --build
docker compose stop
docker compose down
docker compose down -v  # destructive: removes persisted volumes
```

Docker runs separate `chroma`, `backend`, and `frontend` services. The browser
UI is at `http://localhost:3000`; the API is at `http://localhost:8000`.

For local backend/frontend development:

```powershell
# Backend, from repository root
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000

# Frontend, in another terminal
Set-Location frontend
npm install
npm run dev
npm run build
npm run lint
```

The normal backend defaults to `user_data\resector.db` and embedded
`user_data\chroma`. Set `CHROMA_MODE=http` when using a ChromaDB server.

## Desktop architecture

The packaged runtime is:

```text
Tauri 2 shell
  -> bundled resector-backend sidecar (PyInstaller)
      -> FastAPI application
          -> exported Next.js frontend
          -> SQLite + ChromaDB + local documents
          -> optional LLM/Tavily/scholarly APIs
```

Important lifecycle behavior:

- `desktop/src-tauri/src/main.rs` chooses the port, starts the sidecar with
  `RESECTOR_PORT`, `DATA_DIR`, and `FRONTEND_DIR`, waits for readiness, and
  kills the child process on exit.
- The sidecar binds to `127.0.0.1` only.
- The backend serves the static frontend in a packaged build, so the desktop
  frontend uses a same-origin API URL.
- `desktop/splash/index.html` displays startup progress and backend errors.
- Frozen backend output is written to `<DATA_DIR>\logs\backend.log`.
- The embedding model is warmed up during FastAPI lifespan startup; first launch
  can therefore be slow.

## Current system capabilities

1. **Paper chat and RAG**
   - Multi-document PDF indexing and progress polling.
   - Local ChromaDB retrieval with a LangGraph ReAct agent.
   - Optional Tavily web search.
   - Session, message, and document lifecycle management.
2. **Document analysis**
   - Sifter, Critique, and Jargon tools.
   - Text, PDF, TXT, and Markdown inputs.
   - Long-document reference stripping, chunking, condensation, budgets, and
     maximum-part guards.
   - Bounded web search, URL de-duplication, and validated numbered sources.
3. **Citation graph**
   - OpenAlex/Semantic Scholar traversal, ArXiv/DOI matching, fallback search.
   - Citation, reference, cross-citation, bibliographic coupling, Louvain
     communities, importance, proximity, layouts, and GEXF export.
4. **Archive and configuration**
   - Semantic research-history search.
   - Provider selection and validation for Groq, OpenAI, Anthropic, Gemini.
   - Optional Tavily validation and SSR-safe theme switching.

## Code map

### Desktop

- `desktop/package.json`: Tauri CLI and packaging scripts.
- `desktop/scripts/build-frontend.mjs`: static Next.js export for the desktop.
- `desktop/scripts/build_backend.py`: PyInstaller build wrapper.
- `desktop/sidecar/entry.py`: frozen backend entry point and logging.
- `desktop/sidecar/resector_backend.spec`: PyInstaller specification.
- `desktop/sidecar/requirements-desktop.txt`: lean packaged-runtime
  dependencies.
- `desktop/src-tauri/src/main.rs`: native lifecycle and sidecar orchestration.
- `desktop/src-tauri/tauri.conf.json`: window, resources, icons, and bundles.

### Backend

- `backend/main.py`: FastAPI lifecycle, validation, tools, uploads, chat,
  sessions, documents, archive, and graph endpoints.
- `backend/config.py`: environment settings, data paths, Chroma mode, model
  path, and analysis limits.
- `backend/database.py`: SQLAlchemy models, SQLite pragmas, and Chroma client
  singleton.
- `backend/provider_factory.py`: provider adapters and key validation.
- `backend/tools.py`: academic tools, search budgets, long-document processing,
  retry policy, and source handling.
- `backend/services/pdf_processor.py`: extraction, chunking, embedding, and
  indexing.
- `backend/services/rag_agent.py`: paper-chat agent and retrieval tools.
- `backend/services/graph_service.py`: graph resolution and network analysis.

### Frontend

- `frontend/src/app/page.tsx`: main workspace.
- `frontend/src/app/paper-chat/page.tsx`: paper-chat workflow.
- `frontend/src/components/PaperGraphView.tsx`: citation graph.
- `frontend/src/components/SifterTool.tsx`: methodology analysis.
- `frontend/src/components/CritiqueTool.tsx`: persona critique.
- `frontend/src/components/JargonTool.tsx`: jargon simplification.
- `frontend/src/components/DocumentPicker.tsx`: shared document selection.
- `frontend/src/components/SettingsDrawer.tsx`: provider/Tavily settings.
- `frontend/src/components/ResearchHistory.tsx`: archive search.
- `frontend/src/lib/documentApi.ts`: document multipart client.
- `frontend/next.config.ts`: `DESKTOP_BUILD=1` static-export behavior.

## Data locations

Desktop:

- Windows: `%APPDATA%\com.resector.app`
- macOS: `~/Library/Application Support/com.resector.app`
- Linux: `~/.local/share/com.resector.app`

Development:

- SQLite: `user_data\resector.db`
- Embedded ChromaDB: `user_data\chroma`
- Uploaded files: `user_data\uploads`

Do not delete user data or run `docker compose down -v` unless explicitly
requested. Do not revert unrelated worktree changes.

## Change and validation guidelines

- Prefer precise, surgical changes and preserve existing behavior.
- Read nearby code and reuse existing helpers before adding new logic.
- Keep errors explicit; do not hide provider, upload, or startup failures.
- When changing desktop packaging, validate both the frozen backend and the
  Tauri bundle path.
- When changing frontend code, run the smallest relevant TypeScript/build or
  lint command.
- When changing backend code, run focused tests or import/type checks where
  available.
- Keep user-facing documentation synchronized with desktop build behavior.
- Do not add secrets or personal `.env` files to source control.

## Known beta limitations

- The published installer currently targets Windows x64 only.
- Installers are unsigned and may trigger SmartScreen/Gatekeeper warnings.
- API keys are stored in webview local storage; OS keychain storage is planned.
- First launch may be slow while the embedding model is initialized.
