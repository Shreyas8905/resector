# ReSector setup guide

Start here, in this order:

1. [Install the desktop app](#1-desktop-app) (or use [Docker](#4-docker) / [local development](#5-local-development))
2. [Get your API keys](#2-get-your-api-keys)
3. [Add your keys in Settings](#3-add-your-keys-in-settings)

Then, if you need them: [building a release](#6-building-and-releasing-the-desktop-app), [configuration](#configuration), [where your data lives](#where-your-data-lives), [troubleshooting](#troubleshooting).

---

## 1. Desktop app

1. Open the **[latest release](https://github.com/Shreyas8905/resector/releases/latest)** and download the installer from its *Assets* list (`ReSector_<version>_x64-setup.exe`). The newest version number is always shown there.
2. Run it. Windows SmartScreen may warn until the app is code-signed: choose *More info*, then *Run anyway*.
3. Open ReSector. The first start takes a little longer while the local engine starts.
4. Continue with [section 2](#2-get-your-api-keys) to get a key.

**Updates.** On startup the app checks GitHub for a newer signed version. Choose **Update now**: a progress bar appears in the sidebar above the GitHub link, and when it finishes ReSector installs and relaunches itself. The installed version is shown in the same spot. Your data is never touched by updates or uninstalls.

The app uses fixed local port `47821` (another only if that one is taken). Your keys are stored against that address, so keep the port free.

---

## 2. Get your API keys

ReSector needs **one AI key** (pick any provider). A **web-search key** (Tavily) is optional. Keys are personal: never share them or commit them to Git. Prices, free tiers and limits change, so check each provider's page for current terms.

### Which provider should I pick?

| Provider | Cost | Good for | Watch out for |
| :-- | :-- | :-- | :-- |
| **Groq** | Free plan | Trying ReSector quickly; very fast | Free plans have small per-request limits, so long papers are trimmed or retried more often |
| **Google Gemini** | Free plan | Long documents and figures | Free-tier rate limits |
| **OpenAI** | Paid (needs billing) | Strong general quality | Billing must be set up first |
| **Anthropic (Claude)** | Paid (needs billing) | Careful reading and writing | Billing must be set up first |

If unsure, start with **Google Gemini** or **Groq**.

### Groq (free)
1. Go to **https://console.groq.com/keys** and sign in (Google, GitHub or email).
2. Click **Create API Key**, give it a name such as `ReSector`, and click submit.
3. Copy the key now (it starts with `gsk_`). Groq shows it only once.

### Google Gemini (free plan)
1. Go to **https://aistudio.google.com/app/apikey** and sign in with a Google account.
2. Click **Create API key** (choose or create a project if asked).
3. Copy the key (it starts with `AIza`).

### OpenAI (paid)
1. Go to **https://platform.openai.com/api-keys** and sign in. This is the developer platform, separate from a ChatGPT subscription.
2. Add a payment method and some credit under **Billing** (https://platform.openai.com/settings/organization/billing/overview).
3. Back on the API keys page click **Create new secret key**, name it, and copy it (starts with `sk-`).

### Anthropic Claude (paid)
1. Go to **https://console.anthropic.com/settings/keys** and sign in. This is the developer console, separate from a Claude.ai chat subscription.
2. Add credits under **Billing / Plans** in the console.
3. Click **Create Key**, name it, and copy it (starts with `sk-ant-`).

### Tavily web search (optional, free plan)
Tavily lets the AI look things up on the web and cite web pages, in addition to your papers. Skip it if you only want answers from your own PDFs.
1. Go to **https://app.tavily.com** and sign up.
2. Open the dashboard; your key is shown under **API Keys** (starts with `tvly-`). Create one if the list is empty.
3. Copy it.

### Semantic Scholar (optional)
Only needed if the citation graph complains about rate limits. Request a key at **https://www.semanticscholar.org/product/api** and paste it in the matching optional field.

---

## 3. Add your keys in Settings

ReSector opens **Settings** by itself on first launch. You can reopen it any time from the settings button.

1. **Choose an AI service**: click Groq, Google Gemini, OpenAI or Anthropic.
2. **Get a key and paste it here**: use the *Open the ... key page* link if you have not made a key yet, paste the key in the box, and click **Test key**. Wait for the green confirmation.
3. Click **Save and start**.

Optional, under **Advanced options**:
- **AI model**: leave empty to use ReSector's default for that provider. Providers retire older models over time, so if you see a "model not found" error, type a current model name from your provider's model list (for example the name shown in the OpenAI, Anthropic, Google AI Studio or Groq model pages).
- **Web search key**: paste your Tavily key and click **Test**. When set, Paper Chat and the tools can search the web.
- **Semantic Scholar key**: paste if the citation graph is rate-limited.
- **Saved profiles**: save the current provider, key and model under a name (for example "Groq free" and "Claude work") and switch between them in one click.

**Where keys are stored:** in the app's own storage on your computer. They are sent only to your local ReSector engine, which forwards them to the provider you chose. They are not written to the database or shared with anyone else.

**Check it works:** create a dashboard, drop in a PDF, wait for it to finish processing, open **Ask** and ask a question. You should get an answer with clickable citations.

**Figure analysis (optional):** the upload area has a checkbox to read charts and figures in PDFs with a vision model. It uses extra tokens, so leave it off on tight free plans.

---

## 4. Docker

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

Optional: `backend/.env` is picked up if present. You normally do not need it, because AI and web-search keys are entered in the app's Settings (see [section 3](#3-add-your-keys-in-settings)). The compose file forces `DATABASE_URL` to the SQLite file in the volume, so an old Postgres URL in `.env` is ignored.

If you open the UI from another host than `localhost`, change `NEXT_PUBLIC_API_URL` (a build argument of the `frontend` service, the address your **browser** uses to reach the API) and `ALLOWED_ORIGINS` for the backend, then rebuild.

---

## 5. Local development

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

## 6. Building and releasing the desktop app

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
| `TAVILY_API_KEY` | empty | Optional server-side fallback for web search; normally the key is entered in Settings |
| `TOOL_CHAR_BUDGET` | `0` (automatic per provider) | Force a character budget for tool output |
| `TOOL_MAX_PARTS` | `25` | Cost guard for very large documents |
| `ALLOWED_ORIGINS` | localhost:3000 | CORS origins for the web app |
| `RESECTOR_PORT` | `47821` (desktop) | Port of the desktop backend |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | API address the browser uses (frontend build setting) |

Provider, model and API keys are chosen in the app's **Settings** (see [section 3](#3-add-your-keys-in-settings)), not in env files.

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
