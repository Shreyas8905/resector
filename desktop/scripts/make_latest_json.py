"""Write latest.json (the update manifest the app reads) next to the signed installer.

    python desktop/scripts/make_latest_json.py --repo OWNER/REPO --notes "What's new"

Run after `npm run tauri build -- --bundles nsis` (with the signing key set). Upload the installer AND
latest.json to the GitHub release v<version>.
"""
import argparse, json, re
from datetime import datetime, timezone
from pathlib import Path

d = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser()
ap.add_argument("--repo", required=True, help="GitHub owner/name, e.g. shreyas/resector")
ap.add_argument("--notes", default="", help="release notes shown in the update prompt")
a = ap.parse_args()

version = json.loads((d / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))["version"]
nsis = d / "src-tauri" / "target" / "release" / "bundle" / "nsis"
exes = sorted(nsis.glob(f"*{version}*-setup.exe"))
if not exes:
    raise SystemExit(f"No *{version}*-setup.exe in {nsis}. Build first (version in tauri.conf.json is {version}).")
exe = exes[-1]
sig = Path(str(exe) + ".sig")
if not sig.exists():
    raise SystemExit(f"{sig.name} is missing. Set TAURI_SIGNING_PRIVATE_KEY before building so the installer gets signed.")

manifest = {
    "version": version,
    "notes": a.notes,
    "pub_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": {
        "windows-x86_64": {
            "signature": sig.read_text(encoding="utf-8").strip(),
            "url": f"https://github.com/{a.repo}/releases/download/v{version}/{exe.name}",
        }
    },
}
out = nsis / "latest.json"
out.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(f"Wrote {out}\nUpload these two files to the release 'v{version}':\n  {exe}\n  {out}")
