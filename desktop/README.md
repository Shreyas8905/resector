# ReSector desktop app (Tauri)

How it works: the Tauri shell starts a frozen copy of the FastAPI backend (PyInstaller, "sidecar") on
`127.0.0.1`, waits until it is ready, then shows the app. The backend also serves the exported frontend,
so the UI and API share one origin: no CORS and no API URL baked into the build. Your data lives in the
OS app-data folder (Windows `%APPDATA%\com.resector.app`, macOS `~/Library/Application Support/com.resector.app`,
Linux `~/.local/share/com.resector.app`), so updates and uninstalls never touch it.

```
desktop/
  sidecar/entry.py, resector_backend.spec, requirements-desktop.txt   frozen backend
  scripts/build-frontend.mjs, build_backend.py                         produce desktop/build/{frontend,backend}
  src-tauri/                                                           Rust shell, config, icons
  splash/index.html                                                    "starting up" / error screen
```

## Prerequisites
Node 20+, Python 3.12, Rust (https://rustup.rs). Windows also needs "Microsoft C++ Build Tools" and WebView2
(already present on Windows 10/11). Linux needs the Tauri system libraries (webkit2gtk etc.; see the Tauri docs).

## Build an installer (do the steps in this order, the first time one at a time)
```bash
# 1. Backend: use a CLEAN venv (it deliberately leaves out sentence-transformers/PyTorch)
python -m venv .venv-desktop
.venv-desktop\Scripts\activate            # macOS/Linux: source .venv-desktop/bin/activate
pip install -r desktop/sidecar/requirements-desktop.txt
python desktop/scripts/build_backend.py   # -> desktop/build/backend/

# 2. Smoke test the frozen backend BEFORE touching Tauri (most problems show up here)
set DATA_DIR=%TEMP%\resector-test & set RESECTOR_PORT=8123      # macOS/Linux: export ...
desktop\build\backend\resector-backend.exe
# open http://127.0.0.1:8123/health ; log: %TEMP%\resector-test\logs\backend.log

# 3. Frontend static export
cd desktop && npm install && npm run build:frontend

# 4. Installer
npm run tauri build                       # -> desktop/src-tauri/target/release/bundle/
```
`npm run package` does steps 3 + 1 + 4 in one go. Installers must be built on their own OS
(Windows .msi/.exe on Windows, .dmg on macOS, .deb/.AppImage on Linux).

## Develop
- UI only, hot reload: run the backend and `npm run dev` in `frontend/` as usual, then
  `set RESECTOR_DEV_URL=http://localhost:3000 && cd desktop && npm run dev` (opens the app window on your dev server).
- Full app: build the backend + frontend as above, then `npm run dev` in `desktop/`.

## Things to know
- The port is fixed at 47821 (random only if taken). The UI keeps settings (provider, API keys) in the
  webview's localStorage, which is tied to the origin including the port. Moving keys into the OS keychain is a planned step.
- `backend/.env` is never bundled (it can hold personal API keys).
- Unsigned installers show SmartScreen (Windows) / Gatekeeper (macOS) warnings. Signing comes before a public release.
- If the window shows "ReSector could not start", the message includes the path of `backend.log`.
