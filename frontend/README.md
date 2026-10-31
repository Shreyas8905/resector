<div align="center">
  <img src="frontend/public/logos/logo-dark.png" alt="ReSector Logo" width="300" height="300" />

  <h1 style="border-bottom: none;">ReSector</h1>

  <p>A local-first AI research workstation: read papers, ask grounded questions, and map how the ideas connect.</p>
</div>

ReSector keeps your PDFs, notes and vector index on your own machine. You bring an API key for the model provider of your choice (Groq, OpenAI, Anthropic or Google); ReSector does the retrieval, grounding and bookkeeping around it. Every AI answer cites the passage it came from, and you can click a citation to jump to it in the PDF.

It ships two ways from the same code:

- **Desktop app** (Windows installer, signed auto-updates): the easiest way to use it.
- **Web app** you run yourself (Docker or local dev), at `http://localhost:3000`.

---

## What you can do

### Research Dashboards
A dashboard is an infinite canvas for one research question.

- **Canvas and reader**: drop PDFs onto the canvas, open one in the built-in reader, and save quotes or drag-select figures as *excerpts*. Excerpts become cards you can link, comment on and rearrange. Add *My research* cards (your own claims), notes and groups.
- **Grounded Ask, Summarize, Compare**: ask questions across all papers, a selection, or only the excerpts you picked. Answers use numbered passages and clickable citations (`[1]`, `[p.4]`). Summarize one paper, or fill a comparison table (methods, data, results, ...) across many; answers and tables can be pinned back onto the canvas. A token meter shows what each dashboard has used, with an estimate before expensive actions.
- **Connections**: an agent proposes links between papers (and between papers and your own claims): *supports, contradicts, extends, method*. Every suggestion must quote evidence from both sides, shows as a dashed "ghost" link, and only becomes real when you accept it. A **Matrix** view shows all pairs at a glance.
- **Gap check**: for each of your claims, the agent reports whether your papers support it, partly support it, contradict it, or do not cover it, and what to search for next.
- **Comments and export**: threaded comments on any card, undo/redo, find-on-canvas, and a Markdown export of papers, claims, notes, links, answers and tables.
- **Focus controls**: the header is compact, the add-tools bar and the side panels (Ask, Connections, Comments, Reader) can each be hidden and brought back without losing their content, and panels are drag-resizable.

### Paper Chat
Conversational research over uploaded PDFs, with sessions, starter prompts, message deletion and copy-to-clipboard. An agentic (ReAct) retrieval loop searches your local vector index, and optionally the live web (Tavily), and answers with inline references. Charts and figures in PDFs can be analysed with a vision model (optional, set in Settings).

### Tools
- **Methodology Sifter**: pulls out research questions, sample sizes, setups and weaknesses.
- **Adversarial Critique**: stress-tests a hypothesis through five reviewer personas, from Supportive Peer to Hostile Reviewer 2.
- **Jargon Simplifier**: layered explanations and analogies.
- **Citation graph**: builds a citation network from a paper or title using OpenAlex / Semantic Scholar, with community clustering and GEXF export.
- **Research Archive**: searchable history of past tool runs.

---

## How it is built

| Layer | Technology |
| :-- | :-- |
| Frontend | Next.js 16, React, Tailwind, React Flow (canvas), PDF.js (reader) |
| Backend | FastAPI, SQLAlchemy 2 |
| Relational data | **SQLite** (one file in the data folder) |
| Vector index | **ChromaDB**, embedded by default (a Chroma server is optional); bundled `all-MiniLM-L6-v2` embedding model |
| PDF processing | PyMuPDF (text, page rectangles, figure crops) |
| Agents | LangChain / LangGraph ReAct agents behind a provider factory (Groq, OpenAI, Anthropic, Google) |
| Desktop | Tauri v2 shell + the backend frozen with PyInstaller as a sidecar |

![Architecture Diagram](arch.png)

Design notes worth knowing:

- **Your data stays local.** PDFs, the database and the vector index live in one data folder. Only the text snippets needed for an AI call are sent to the provider you configured.
- **Provider limits are handled for you.** A token-budget layer keeps each model call within that provider's per-request limit: long tool output is trimmed first, then old history. If a provider still rejects a call as too large, the call is shrunk and retried; on rate limits it waits for the time the provider reports. Limits are also learned from provider error messages.
- **Grounding is enforced.** Citation numbers the model invents are dropped, and AI-found quotes are located in the PDF by text search so clicking them highlights the right place.
- **AI suggestions never change your canvas on their own.** They wait for you to accept or dismiss them.
- **Beta rule for developers:** schema changes must be additive (new tables only, no column changes) until a migration mechanism exists, so existing users' databases keep working across updates.

---

## Get started

| I want to... | Go to |
| :-- | :-- |
| Just use ReSector | Install the desktop app from the latest GitHub Release (see [SETUP.md](./SETUP.md#1-desktop-app)) |
| Run it on my machine with Docker | [SETUP.md](./SETUP.md#2-docker) |
| Develop it | [SETUP.md](./SETUP.md#3-local-development) |
| Build or ship a desktop release | [SETUP.md](./SETUP.md#4-building-and-releasing-the-desktop-app) and [desktop/RELEASING.md](./desktop/RELEASING.md) |

Quick start with Docker:

```bash
docker compose up -d --build     # then open http://localhost:3000
```

On first launch open **Settings**, pick a provider and paste your API key. Keys are stored in your browser/webview storage on your machine, not on a server.

---

## Repository layout

```
backend/          FastAPI app (main.py), dashboards*.py routers, services/ (RAG, grounding, wiring, token budget, figures)
frontend/         Next.js app (src/app, src/components, src/components/dashboard, src/lib)
desktop/          Tauri shell, PyInstaller sidecar, build and release scripts
scripts/          Developer utilities
docker-compose.yml  chroma + backend + frontend
SETUP.md          Install, run, build, release, troubleshoot
```

Embedding model credit: sentence-transformers/all-MiniLM-L6-v2.
