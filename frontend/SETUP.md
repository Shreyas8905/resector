# ReSector setup guide

Four ways in: [desktop app](#1-desktop-app), [Docker](#2-docker), [local development](#3-local-development), and [building a desktop release](#4-building-and-releasing-the-desktop-app). Then [configuration](#configuration), [where your data lives](#where-your-data-lives) and [troubleshooting](#troubleshooting).

You need an API key for at least one provider (Groq, OpenAI, Anthropic or Google). Groq has a free tier, but its per-request limits are small; ReSector trims and retries automatically, though bigger models or paid tiers give better results on long papers. A Tavily key is optional and enables live web search.

---

## 1. Desktop app

1. Download the latest `ReSector_<version>_x64-setup.exe` from the repository's **Releases** page and run it. (Windows SmartScreen may warn until the app is code-signed; choose *More info > Run anyway*.)
2. Open ReSector. The first start takes a little longer while the local backend starts.
3. Open **Settings**, choose a provider and paste your API key.

**Updates.** On startup the app checks GitHub for a newer signed version. Choose **Update now** and a progress bar appears in the sidebar above the GitHub link; when it finishes, ReSector installs and relaunches itself. The current version tag is shown in the same spot. Your data is never touched by updates or uninstalls.

Notes: the app uses fixed local port `47821` (another port only if it is taken). API keys are kept in the app's webview storage, tied to that origin, so keep the port free.

---

## 2. Docker

Requires Docker with Compose v2.24 or newer.

```bash
git clone <your-repo-url> && cd <repo>
docker compose up -d --build
```

Open `http://localhost:3000`. This starts three containers: `chroma` (vector server), `backend` (API on port 8000) and `frontend` (web UI on port 3000). The first start downloads the embedding model (~80 MB) if it is not cached; the backend health check allows up to 15 minutes for this.

Useful commands:

```bash
docker compose logs -f backend     # watch the backend
docker compose stop                # stop, keep data
docker compose up -d --build       # rebuild after pulling changes
```

> Never run `docker compose down -v` unless you want to delete all data. Named volumes hold your database and PDFs (`user_data`), the vector index (`chroma_data`) and the model cache (`model_cache`).

Optional: put keys such as `TAVILY_API_KEY` in `backend/.env`; Compose picks it up if present. The compose file forces `DATABASE_URL` to the SQLite file in the volume, so an old Postgres URL in `.env` is ignored.

If you open the UI from another host than `localhost`, change `NEXT_PUBLIC_API_URL` (a build argument of the `frontend` service, the address your **browser** uses to reach the API) and `ALLOWED_ORIGINS` for the backend, then rebuild.

---

## 3. Local development

Prerequisites: Python 3.12, Node 20+ (22 recommended). No database server is needed: SQLite and ChromaDB run embedded.

**Backend** (run from the repository root):

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Check `http://localhost:8000/health`. Data goes to `user_data/` in the repo root unless `DATA_DIR` is set. The first run downloads the embedding model unless a bundled copy exists.

**Frontend**:

```bash
cd frontend
npm install
npm run dev
```

Create `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8000` if it is missing. Open `http://localhost:3000`.

**Checks.** Frontend: `npm run lint` and `npx tsc --noEmit`. The repository does not ship an automated backend test suite yet.

**Running a Chroma server instead of embedded** (optional): `chroma run --host 0.0.0.0 --port 5000 --path ./chroma_data`, then start the backend with `CHROMA_MODE=http CHROMA_HOST=localhost CHROMA_PORT=5000`.

---

## 4. Building and releasing the desktop app

Prerequisites: Node 20+, Python 3.12, Rust (https://rustup.rs). Windows also needs the Microsoft C++ Build Tools and WebView2 (present on Windows 10/11). Installers must be built on their own OS; only Windows (NSIS) is set up today.

```powershell
# 1. Frozen backend. Use a CLEAN venv (it deliberately leaves out PyTorch / sentence-transformers)
python -m venv .venv-desktop
.venv-desktop\Scripts\activate
pip install -r desktop/sidecar/requirements-desktop.txt
python desktop/scripts/build_backend.py          # -> desktop/build/backend/

# 2. Smoke-test it before touching Tauri
$env:DATA_DIR="$env:TEMP\resector-test"; $env:RESECTOR_PORT="8123"
desktop\build\backend\resector-backend.exe       # open http://127.0.0.1:8123/health

# 3. Static frontend export, then the installer
cd desktop
npm install
npm run build:frontend
npm run tauri -- build --bundles nsis            # -> desktop/src-tauri/target/release/bundle/nsis/
```

**Develop the shell.** With the backend and `npm run dev` (frontend) running: `set RESECTOR_DEV_URL=http://localhost:3000` then `cd desktop && npm run dev`.

**Shipping a version with auto-update.** One-time: generate a signing key (`npm run tauri -- signer generate -w <path>`), put the public key in `desktop/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`) and your repo in the updater `endpoints`. Back the private key up; without it installed apps can never be updated. Per release:

```powershell
python desktop\scripts\bump_version.py 0.1.2
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content <key path> -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<password or empty>"
# rebuild backend/frontend if they changed, then:
cd desktop; npm run tauri -- build --bundles nsis; cd ..
python desktop\scripts\make_latest_json.py --repo OWNER/REPO --notes "What's new"
```

Then create a GitHub Release tagged `v0.1.2`, upload the installer **and** `latest.json`, and publish it as a normal release (not a pre-release: GitHub's "latest" link ignores those). Full walkthrough and the update test procedure: [desktop/RELEASING.md](./desktop/RELEASING.md). Shell-level notes: [desktop/README.md](./desktop/README.md).

**Beta rule:** schema changes must be additive (new tables only); never rename or drop columns.

---

## Configuration

Settings that normally need no change. Set them as environment variables or in `backend/.env`.

| Variable | Default | Purpose |
| :-- | :-- | :-- |
| `DATA_DIR` | `./user_data` (desktop: app-data folder; Docker: `/data`) | Database, uploads, vector index, logs |
| `DATABASE_URL` | SQLite file in `DATA_DIR` | Override the database (SQLite is the supported choice) |
| `CHROMA_MODE` | `embedded` | `embedded` or `http` (use a Chroma server) |
| `CHROMA_PATH` | `DATA_DIR/chroma` | Where the embedded index is stored |
| `CHROMA_HOST`, `CHROMA_PORT` | `localhost`, `5000` | Used in `http` mode |
| `EMBEDDING_MODEL_DIR` | bundled model if present | Folder holding the embedding model |
| `TAVILY_API_KEY` | empty | Enables live web search tools |
| `TOOL_CHAR_BUDGET` | `0` (automatic per provider) | Force a character budget for tool output |
| `TOOL_MAX_PARTS` | `25` | Cost guard for very large documents |
| `ALLOWED_ORIGINS` | localhost:3000 | CORS origins for the web app |
| `RESECTOR_PORT` | `47821` (desktop) | Port of the desktop backend |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | API address the browser uses (frontend build setting) |

Provider, model and API keys are chosen in the app's **Settings**, not in env files.

## Where your data lives

| Mode | Location |
| :-- | :-- |
| Desktop (Windows) | `%APPDATA%\com.resector.app` (database, `uploads/`, `chroma/`, `logs/`) |
| Docker | Named volumes `user_data`, `chroma_data`, `model_cache` |
| Local dev | `user_data/` in the repo root |

Back up by copying the data folder while the app is closed. Desktop logs: `logs/backend.log` and `logs/shell.log` inside the data folder.

---

## Troubleshooting

| Symptom | Fix |
| :-- | :-- |
| "Request too large" / 413 from Groq | ReSector shrinks and retries automatically. If it persists, pick a model with a larger limit in Settings, or use a paid tier. |
| "Rate limit" / 429 | The app waits for the time the provider reports and retries; wait a minute and retry for daily limits. |
| Backend shows "embedding model" errors on first start | The model downloads once (~80 MB); keep the network up. In Docker, wait for the health check. |
| Desktop: "ReSector could not start" | The message shows the `backend.log` path. Usually the port is in use or antivirus blocked the sidecar. |
| Desktop: update prompt appears but nothing happens | Check `logs/shell.log`. Ensure the release has both the installer and `latest.json` and is not a pre-release. |
| UI cannot reach the API (web) | Check `NEXT_PUBLIC_API_URL` and `ALLOWED_ORIGINS`, then rebuild the frontend. |
| Settings/keys vanished after an update | Keys live in webview storage tied to origin and port; keep the fixed port `47821` free. |
| PDF stays "processing" | Scanned (image-only) PDFs have no text to index; use an OCR'd copy. |
| Canvas feels cramped | Use the header buttons to hide the side panels or the add tools, or enter focus mode; drag panel edges to resize. |
