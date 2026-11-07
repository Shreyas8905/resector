# CLAUDE.md
Repository guidance for coding assistants working on ReSector.

## Product and architecture

ReSector is a local-first research workstation. The current desktop product is
a Tauri 2 shell (`desktop/src-tauri`) that starts a PyInstaller FastAPI sidecar
(`desktop/sidecar`). The sidecar serves an exported Next.js frontend and owns
SQLite, ChromaDB, uploaded documents, extracted figures, and logs.

Browser and Docker development remain supported. In those modes the frontend
and backend are separate processes and the backend uses the same SQLite and
embedded-Chroma defaults unless configured otherwise.

The application has three related surfaces:

- **Workspace tools**: paper chat, citation graph, methodology sifter,
  adversarial critique, jargon simplifier, and research-history search.
- **Research dashboards**: a React Flow canvas for papers, excerpts, notes,
  claims, comments, relationships, and Markdown export.
- **Writing and analysis**: grounded dashboard questions, summaries, comparison
  rows, connection/gap agents, citation-aware drafts, draft checking, and
  section autopilot.

External providers are optional integrations. LLM providers are Groq, OpenAI,
Anthropic, and Google Gemini. Tavily is optional web search; OpenAlex,
Semantic Scholar, arXiv/DOI lookup, and related scholarly services support the
graph. API keys are entered in the UI and sent per request; do not commit keys,
`.env` files, uploads, databases, vector stores, or build artifacts.

## Important invariants

- Keep changes surgical and preserve existing behavior.
- Database changes are additive. There is no migration system; `init_db()`
  creates missing tables, so do not rename or remove existing columns/tables
  without an explicit migration plan.
- Dashboard AI must remain grounded in retrieved passages, saved excerpts, or
  selected papers. Preserve citation validation and never invent source
  references.
- AI suggestions, links, draft text, and checker findings must not mutate
  user content without an explicit UI action.
- Uploaded filenames are sanitized and all document/vector/figure cleanup must
  be handled when deleting a document, session, or dashboard.
- Keep error responses explicit. Do not silently fall back to success-shaped
  data or catch broad exceptions without logging and a user-visible error.
- The packaged backend binds to `127.0.0.1`; do not expose it on a public
  interface.
- Use the existing frontend helpers (`dashboardApi`, `documentApi`,
  `useDialogs`, appearance helpers, shared CSS variables) rather than
  duplicating request or UI behavior.

## Repository map

### Backend

- [`backend/main.py`](./backend/main.py): FastAPI lifecycle, CORS, health,
  tool/upload/chat/graph routes, and desktop static-file serving.
- [`backend/database.py`](./backend/database.py): SQLAlchemy models, SQLite
  pragmas, session factory, and Chroma client/model warm-up.
- [`backend/config.py`](./backend/config.py): `DATA_DIR`, database, Chroma,
  embedding, and document-analysis settings.
- [`backend/provider_factory.py`](./backend/provider_factory.py): provider
  adapters and model/key configuration.
- [`backend/tools.py`](./backend/tools.py): Sifter, Critique, Jargon,
  long-document handling, bounded search, and retry behavior.
- [`backend/dashboards.py`](./backend/dashboards.py): dashboard CRUD, canvas,
  papers, excerpts, comments, and export.
- [`backend/dashboards_ai.py`](./backend/dashboards_ai.py): grounded dashboard
  ask, summarize, compare, locate, estimates, and usage.
- [`backend/dashboards_wire.py`](./backend/dashboards_wire.py): connection and
  gap runs, progress, cancellation, suggestions, and estimates.
- [`backend/dashboards_drafts.py`](./backend/dashboards_drafts.py): drafts,
  versions, source suggestions, checker, autopilot, and export.
- [`backend/services/`](./backend/services/): PDF indexing, RAG, grounding,
  token budgets, graph traversal, figures/vision, dashboard AI, wiring, and
  draft logic.

### Frontend

- [`frontend/src/app/page.tsx`](./frontend/src/app/page.tsx): shell, navigation,
  command palette, appearance controls, and tool selection.
- [`frontend/src/app/paper-chat/page.tsx`](./frontend/src/app/paper-chat/page.tsx):
  sessions, uploads, progress, chat, figures, and message management.
- [`frontend/src/components/dashboard/`](./frontend/src/components/dashboard/):
  canvas, PDF reader, dashboard panels, wiring, drafts, checker, and export.
- [`frontend/src/lib/dashboardApi.ts`](./frontend/src/lib/dashboardApi.ts):
  typed dashboard API client and response types.
- [`frontend/src/lib/`](./frontend/src/lib/): API, citation, draft, figure,
  appearance, desktop, geometry, and error helpers.

### Desktop and deployment

- [`desktop/src-tauri/src/main.rs`](./desktop/src-tauri/src/main.rs): port
  selection, sidecar lifecycle, readiness, updater, and shutdown.
- [`desktop/src-tauri/tauri.conf.json`](./desktop/src-tauri/tauri.conf.json):
  bundle resources, updater endpoint/key, window, and installer settings.
- [`desktop/scripts/`](./desktop/scripts/): static frontend and PyInstaller
  builds plus release metadata helpers.
- [`docker-compose.yml`](./docker-compose.yml): Chroma, backend, and frontend
  services with persistent named volumes.

## Windows commands

### Local backend/frontend

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000

Set-Location frontend
npm install
npm run dev
npm run lint
npx tsc --noEmit
```

Set `frontend\.env.local` to
`NEXT_PUBLIC_API_URL=http://localhost:8000` when the frontend cannot infer the
API URL. The backend defaults to `user_data\resector.db` and
`user_data\chroma`; set `CHROMA_MODE=http` for a Chroma server.

### Desktop development and packaging

Prerequisites are Node.js 20+, Python 3.12, Rust via rustup, Microsoft C++
Build Tools, and WebView2 on Windows.

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

`Set-Location desktop; npm run package` performs the frontend build, backend
freeze, and Tauri bundle. Build output is under
`desktop\src-tauri\target\release\bundle\`.

For UI-only development, run `frontend\npm run dev`, set
`$env:RESECTOR_DEV_URL = "http://localhost:3000"`, then run `desktop\npm run dev`.
The shell normally tries `127.0.0.1:47821` and chooses a free fallback if it is
occupied.

### Docker

```powershell
docker compose up --build
docker compose stop
docker compose down
```

The browser UI is at `http://localhost:3000` and the API at
`http://localhost:8000`. Never run `docker compose down -v` unless the user
explicitly wants all named-volume data removed.

## Data locations

Desktop data is in the Tauri app-data directory:

- Windows: `%APPDATA%\com.resector.app`
- macOS: `~/Library/Application Support/com.resector.app`
- Linux: `~/.local/share/com.resector.app`

Development data is in `user_data\` unless `DATA_DIR` is set. It contains the
SQLite database, Chroma index, uploads, excerpts, figures, and logs. Frozen
backend logs are `logs\backend.log`; the shell writes `logs\shell.log`.

## Validation expectations

- Frontend changes: run the smallest relevant `npm run lint` or
  `npx tsc --noEmit`; use `npm run build` for build/export changes.
- Backend changes: run focused pytest tests where available and at least an
  import or syntax check for changed Python modules.
- Desktop packaging changes: validate both the frozen backend build and the
  static frontend/Tauri resource paths.
- Do not delete user data or revert unrelated worktree changes.
