# ReSector Setup Guide

ReSector can be used as a packaged desktop application or as a local web
application. Choose the setup that matches your use case:

1. **Desktop beta:** Windows x64 installer; backend and frontend are bundled.
2. **Web with Docker:** separate ChromaDB, FastAPI, and Next.js containers.
3. **Web without Docker:** run the FastAPI backend and Next.js frontend
   directly on your machine.

The desktop and web versions expose the same Settings drawer for configuring
provider credentials. API keys are optional until a feature that needs an LLM
or web search is used.

## 1. Desktop beta

### Install

Download `ReSector_0.1.0_x64-setup.exe` from the
[v0.1.0-beta.1 GitHub release](https://github.com/Shreyas8905/resector/releases/tag/v0.1.0-beta.1)
and run the installer.

The installer is currently unsigned, so Windows SmartScreen may show a warning.
The current public artifact targets Windows x64; macOS and Linux installers are
not published yet.

### Configure keys in the desktop app

1. Launch ReSector.
2. Click **Settings** in the top-right corner.
3. Under **LLM Configuration**, select an **AI Provider**:
   - **Groq**
   - **OpenAI**
   - **Anthropic**
   - **Google Gemini**
4. Enter the matching provider key in **LLM API Key**.
5. Optionally enter a provider-specific **Model Name**. Leave it blank to use
   the provider default.
6. Click **Test** beside the LLM key. Wait for the `API key is valid` message.
7. Optional: enter a **Tavily API Key (For Web Search)** and click its **Test**
   button. Tavily enables bounded web verification and source discovery.
8. Optional: enter a **Semantic Scholar API Key** for higher graph API rate
   limits. Public unauthenticated access works when this is left blank.
9. Click **Apply Configuration**.

The configuration is saved in the desktop webview's local storage for the
application origin. It is not written to the repository or bundled into the
installer. Use **Saved Profiles** in the same drawer if you want to store and
switch between multiple provider configurations. Do not share profiles that
contain private keys.

### Desktop data and logs

The packaged app stores its database, uploaded documents, ChromaDB index,
embedding data, and logs in:

- Windows: `%APPDATA%\com.resector.app`
- Log file: `%APPDATA%\com.resector.app\logs\backend.log`

The first launch can take longer while the embedding model is initialized. If
the app cannot start, the splash screen displays the backend log path.

## 2. Web with Docker

### Prerequisites

- Docker Desktop with Docker Compose support
- Ports `3000` and `8000` available

### Start

From the repository root:

```bash
docker compose up --build
```

Open the frontend at `http://localhost:3000`. The FastAPI API is available at
`http://localhost:8000`.

Do not add provider keys to the image or commit them to
`backend/.env`. Start the app, open **Settings**, configure the LLM provider,
test the key, optionally configure Tavily/Semantic Scholar, and click **Apply
Configuration**. This is the recommended way to configure keys for normal
interactive use.

The optional `backend/.env` file is intended for server-side defaults and
development automation:

```env
TAVILY_API_KEY=your_tavily_key_here
# Optional overrides:
# DATA_DIR=/data
# DATABASE_URL=sqlite:////data/resector.db
# CHROMA_MODE=http
# CHROMA_HOST=chroma
# CHROMA_PORT=5000
```

The Compose deployment overrides the database and Chroma host so that the
backend uses SQLite in its persistent `/data` volume and the `chroma` service.
The frontend is built with `NEXT_PUBLIC_API_URL=http://localhost:8000`.

### Stop and remove data

```bash
# Stop while keeping volumes
docker compose stop

# Stop and remove containers, keeping volumes
docker compose down

# Destructive: remove persisted database, documents, vectors, and model cache
docker compose down -v
```

### View logs

```bash
docker compose logs -f
docker compose logs -f backend
```

## 3. Web without Docker

### Prerequisites

- Python 3.10 or newer
- Node.js 20+ and npm
- Optional: a local ChromaDB server; embedded ChromaDB is the default

PostgreSQL is not required. The default relational database is SQLite.

### Install backend dependencies

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

On macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

### Configure optional server defaults

Create `backend/.env` only when you need server-side defaults:

```env
# Optional: enables web search when no key is supplied by the browser
TAVILY_API_KEY=your_tavily_key_here

# Optional; SQLite and embedded ChromaDB are the defaults
# DATABASE_URL=sqlite:///./user_data/resector.db
# CHROMA_MODE=embedded
# CHROMA_PATH=./user_data/chroma
```

For normal user-specific configuration, prefer the **Settings** drawer instead
of putting personal keys in this file.

### Start the backend

From the repository root, with the virtual environment active:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```

On macOS/Linux:

```bash
python -m uvicorn backend.main:app --reload --port 8000
```

The backend initializes SQLite and warms the embedding model during startup.
Check `http://localhost:8000/health` if the frontend cannot connect.

### Start the frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The frontend uses
`NEXT_PUBLIC_API_URL` when it is set; for local development it should point to
the backend:

```powershell
$env:NEXT_PUBLIC_API_URL = "http://localhost:8000"
npm run dev
```

If the variable is managed through `frontend/.env.local`, do not commit that
file:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Configure API keys from Settings

The web UI and desktop UI use the same workflow:

1. Open the **Settings** button in the application header.
2. Select the provider you want to use.
3. Enter its LLM key and click **Test**.
4. Add and test a Tavily key if you want web search.
5. Add a Semantic Scholar key if you need higher graph API limits.
6. Click **Apply Configuration** before using Paper Chat, Sift Research,
   Stress Test, Simplify Text, or the Citation Graph.

The key is sent to the local FastAPI endpoint for validation and is then used
by requests from the browser. The saved configuration is kept in browser
local storage. Clearing site data, changing the browser origin, or using a
different port may require entering the keys again.

### Provider notes

- **LLM key:** required for Paper Chat, Methodology Sifter, Adversarial
  Critique, and Jargon Simplifier.
- **Tavily key:** optional. Enables bounded live-web searches, citations, and
  contemporary verification. Without it, tools operate from supplied text and
  the model's configured knowledge.
- **Semantic Scholar key:** optional. Used for higher rate limits in citation
  graph requests.
- **Model Name:** optional. Use a model supported by the selected provider; an
  invalid model can cause validation or request errors.

Keys are never supplied by this project. Create them through the provider's
official dashboard and review each provider's pricing, quotas, and data policy.

## Troubleshooting

### “Please configure your API key in Settings”

Open **Settings**, enter an LLM key, click **Test**, and click **Apply
Configuration**. A key saved in `backend/.env` does not replace the browser
configuration for every request.

### “Invalid API key” or validation failure

Confirm that the selected provider matches the key, remove surrounding spaces,
check the provider dashboard for quota/billing restrictions, and test again.
For Tavily, use the Tavily key in the separate Tavily field.

### Frontend cannot connect to the API

Confirm that the backend is running on port `8000`, then check
`http://localhost:8000/health`. For local web development, set
`NEXT_PUBLIC_API_URL=http://localhost:8000` before starting Next.js. For Docker,
rebuild after changing Compose configuration.

### First startup is slow

The backend warms the local embedding model during startup. This can take
longer on the first run; subsequent runs use the local cache.

### Port conflicts

Free ports `3000` and `8000`, or change the frontend/backend commands and
`NEXT_PUBLIC_API_URL` together. The desktop app prefers port `47821` and
automatically chooses a local fallback when it is occupied.
