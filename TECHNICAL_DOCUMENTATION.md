# ReSector: technical documentation

Audience: contributors and anyone evaluating how ReSector works. For installation see [SETUP.md](./SETUP.md); for the product overview see [README.md](./README.md).

## 1. Architecture

![Architecture Diagram](arch.png)

ReSector is a local-first application. The UI talks to a FastAPI backend over HTTP; the backend owns the relational store (SQLite), the vector index (ChromaDB) and the uploaded files, and calls the user's chosen LLM provider with the user's own API key.

| Layer | Technology |
| :-- | :-- |
| Frontend | Next.js 16, React, Tailwind, React Flow (canvas), PDF.js (reader) |
| Backend | FastAPI, SQLAlchemy 2, Pydantic |
| Relational data | SQLite (`foreign_keys` ON, autoincrement ids) |
| Vector index | ChromaDB, embedded `PersistentClient` by default; optional HTTP server (`CHROMA_MODE=http`) |
| Embeddings | `all-MiniLM-L6-v2` (ONNX), bundled with the repo/app |
| PDF processing | PyMuPDF: text, page geometry, figure crops |
| Agents | LangChain + LangGraph `create_react_agent` behind a provider factory |
| Providers | Groq, OpenAI, Anthropic, Google Gemini |
| Desktop | Tauri v2 shell + PyInstaller-frozen backend sidecar |

Deployment shapes:

1. **Desktop**: Tauri starts the frozen backend on `127.0.0.1:47821`, which also serves the statically exported frontend (single origin, no CORS).
2. **Docker**: `chroma` + `backend` + `frontend` containers; data in named volumes.
3. **Dev**: `uvicorn` + `next dev`, embedded Chroma, data in `user_data/`.

## 2. Repository layout

```
backend/
  main.py                 app, CORS, chat/upload/tools routes, static frontend mount (desktop)
  database.py             SQLAlchemy models
  config.py               settings and env vars
  provider_factory.py     provider abstraction
  dashboards.py           dashboard CRUD, canvas save, documents, excerpts, comments, export
  dashboards_ai.py        grounded ask / summarize / compare / locate / estimate / usage
  dashboards_wire.py      connection-agent and gap-check runs, suggestions
  tools.py                Sifter, Critique, Jargon logic
  services/
    rag_agent.py          ReAct agent for Paper Chat
    grounding.py          numbered passages, citation normalisation
    dashboard_ai.py       prompts and answer assembly for dashboards
    wiring.py, wire_ai.py pair selection, evidence checks, agent runs
    token_budget.py       per-provider limits, trimming, retry helpers
    pdf_processor.py      chunking and indexing
    figure_*.py, vision*.py  figure extraction and vision analysis
    graph_service.py      citation graph
    dashboard_export.py   Markdown export
frontend/src/
  app/                    page.tsx (shell, tools), paper-chat/
  components/             tools, settings, dialogs
  components/dashboard/   Canvas, nodes, PdfReader, AskPanel, ConnectionsPanel, MatrixView, ...
  lib/                    API clients, citation and rectangle helpers
desktop/
  src-tauri/              Rust shell, updater, capabilities, tauri.conf.json
  sidecar/                PyInstaller entry and spec
  scripts/                build_backend, build-frontend, bump_version, make_latest_json
```

## 3. Data model

SQLite tables (SQLAlchemy). Schema changes must be **additive** (new tables only) because there is no migration mechanism yet.

- Chat side: user sessions, messages, documents (with processing progress and status), figure records.
- Dashboard side: `Dashboard`, `CanvasNode`, `CanvasEdge`, `Excerpt`, `CanvasComment`, `AiUsage`, `WireSuggestion`, `AgentRun`.

Each dashboard owns a hidden chat session (ids prefixed `dash_`, filtered from the normal session list), so uploads, chunking, Chroma collections and figure extraction reuse the Paper Chat pipeline unchanged.

The canvas is saved by a debounced `PUT /dashboards/{id}/canvas` that replaces all nodes and edges (validated server-side). An *excerpt* stores paper, page, normalised rectangles, the quote and a prefix/suffix for re-location. Area excerpts have a cropped PNG served on demand.

## 4. Retrieval and grounding

1. PDFs are parsed per page, chunked and embedded into a per-session Chroma collection; chunk metadata keeps page numbers.
2. For Ask, the backend retrieves the top passages (restricted to the selected papers or excerpts when specified) and presents them to the model as **numbered passages**.
3. The model must cite with `[n]` (or `[p.N]` for page-level). `normalize_citations` removes any number that does not exist, so invented sources cannot reach the UI.
4. Each citation is resolved to paper, page and quote; where rectangles are missing they are found by searching the page text (`find_page`, `search_for`). The frontend renders citations as clickable chips that open the reader and highlight the rectangles.
5. Paper Chat uses a ReAct agent with tools for local retrieval, figure lookup and optional Tavily web search.

## 5. Connection agent and gap check

- Candidate pairs (paper-paper, paper-claim) are generated, then each pair is checked by the model, which must return a relation (`supports`, `contradicts`, `extends`, `method`), a summary, a confidence and **quotes from both sides**. Suggestions without evidence from both are discarded.
- Results are stored as `WireSuggestion` rows with status `pending | accepted | dismissed | none`. `none` rows are kept so pairs are not paid for twice.
- Pending suggestions render as ghost edges derived at view time (not saved in canvas state). Accepting creates a real edge; the accepted suggestion is matched to its edge by the two endpoint cards.
- Runs execute as asyncio tasks with a registry, progress counters, token totals and cancellation (`AgentRun`). The gap check reports `supported | partly | contradicted | not_covered` per claim with citations and a suggested search.

## 6. Token budgets and provider limits

`services/token_budget.py` keeps every call inside the provider's per-request limit:

- Per-model limits (conservative guesses for free tiers) are corrected by values learned from provider error text.
- `fit_messages` trims in order: tool output, old history, the newest tool result, and only last the question.
- A 413 triggers shrink-and-retry; a 429 waits for the provider's "try again in" time.
- Agent tools are call-limited and a `GraphRecursionError` falls back to answering from what was gathered.
- Dashboard actions record usage in `AiUsage` and offer pre-run estimates.

## 7. Desktop shell and updater

- Rust (`src-tauri/src/main.rs`) starts the sidecar, waits for `/health`, then shows the app window; a splash page shows startup or errors. Preferred port 47821; data in the OS app-data folder; logs in `logs/shell.log` and `logs/backend.log`.
- Updater (tauri-plugin-updater): checks `latest.json` from GitHub Releases, verifies the signature against the public key in `tauri.conf.json`, downloads with progress, stops the backend (avoids Windows file locks), installs and relaunches.
- The web UI talks to the shell through `window.__TAURI_INTERNALS__.invoke` (allowed for local origins by the capability file) and receives status through a DOM `resector-update` event. A native dialog is the fallback if the UI has not loaded.
- Bundle: NSIS installer, passive install mode.

## 8. Security and privacy notes

- API keys are stored in webview/browser storage and sent per request to the local backend, which forwards them to the provider. Keys are not written to the database. Moving them to the OS keychain is planned.
- `backend/.env` is excluded from desktop bundles.
- The backend binds to localhost on desktop. CORS origins are explicit (`ALLOWED_ORIGINS`) for the web build.
- Only the text needed for a request (retrieved passages, the question, short history) is sent to the provider.

## 9. Conventions

- Beta rule: additive schema changes only.
- AI suggestions never mutate user content without an explicit accept.
- UI uses shared CSS variables and classes (`.btn`, `.field`, `.prose`, ...) and the `useDialogs()` hook for confirms and notices.
- Resizable panels share `usePanelWidth` / `ResizeHandle`; their widths and the dashboard hide/focus preferences persist in `localStorage`.
