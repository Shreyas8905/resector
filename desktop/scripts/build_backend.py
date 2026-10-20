"""Freeze the backend with PyInstaller and copy it to desktop/build/backend.

    python -m venv .venv-desktop && .venv-desktop/Scripts/activate      (Windows; use bin/activate elsewhere)
    pip install -r desktop/sidecar/requirements-desktop.txt
    python desktop/scripts/build_backend.py
"""
import shutil
import subprocess
import sys
from pathlib import Path

desktop = Path(__file__).resolve().parents[1]
work = desktop / "build-tmp"
out = desktop / "build" / "backend"

subprocess.check_call([
    sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
    "--distpath", str(work / "dist"), "--workpath", str(work / "work"),
    str(desktop / "sidecar" / "resector_backend.spec"),
])
if out.exists():
    shutil.rmtree(out)
shutil.copytree(work / "dist" / "resector-backend", out)
print(f"\nBackend bundle ready: {out}")
