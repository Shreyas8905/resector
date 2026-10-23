# Releasing and updating ReSector

Installed apps check GitHub for `latest.json` on startup. If it lists a newer version signed with your
key, the app asks "Update now / Later", downloads it, stops its backend, installs and relaunches.
User data lives in `%APPDATA%\com.resector.app` and is never touched.

## One-time setup

1. **Make the signing key** (do this once, never commit it, back it up: if you lose it, installed apps can never be updated again):
   ```powershell
   cd desktop
   npm run tauri -- signer generate -w $env:USERPROFILE\.tauri\resector.key
   ```
   It prints a public key (also saved in `resector.key.pub`).
2. In `src-tauri/tauri.conf.json` set `plugins.updater.pubkey` to that public key, and replace
   `OWNER/REPO` in `endpoints` with your GitHub repo (`owner/name`). The repo must be public.
3. Add to `.gitignore`: `.venv-desktop/`

## Ship a version (manual flow)

```powershell
# 1. new version number (everything must go up, e.g. 0.1.2)
python desktop\scripts\bump_version.py 0.1.2

# 2. build + sign the installer
python desktop\scripts\build_backend.py          # only if backend code changed
cd desktop
npm run build:frontend                           # only if frontend code changed
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $env:USERPROFILE\.tauri\resector.key -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<the password you chose, or empty>"
npm run tauri build -- --bundles nsis

# 3. write the update manifest
cd ..
python desktop\scripts\make_latest_json.py --repo OWNER/REPO --notes "What's new in this version"
```
4. On GitHub: Releases -> Draft a new release -> new tag `v0.1.2` (must equal the version, with a `v`).
   Upload **both** `ReSector_0.1.2_x64-setup.exe` and `latest.json` (paths are printed by the script).
   **Do not tick "pre-release"**: GitHub's `/releases/latest/` link ignores pre-releases, so the app would never see it.
   Publish.

## Test the update path once
1. Install a build that already contains the updater (0.1.1, installed manually). Older 0.1.0 installs have no
   updater and must be reinstalled by hand once.
2. Release 0.1.2 as above, then start the installed 0.1.1: after a few seconds the "Update available" prompt appears.
3. Click "Update now": the installer runs passively, the app relaunches as 0.1.2 with your data intact.

## Rules for the beta (no database migrations yet)
Schema changes must be additive (new tables only). Changing or removing a column would break existing users' databases.
