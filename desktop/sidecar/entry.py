"""Entry point of the frozen backend ("sidecar") that the Tauri shell launches.

Environment (set by the shell):
  RESECTOR_PORT  port to listen on (127.0.0.1 only)
  DATA_DIR       where the database, uploads, figures and vectors live (OS app-data folder)
  FRONTEND_DIR   folder with the exported frontend, served at "/"
"""
import multiprocessing
import os
import sys
from pathlib import Path


def _redirect_output() -> None:
    """The frozen app has no console: send everything to DATA_DIR/logs/backend.log."""
    log_dir = Path(os.environ.get("DATA_DIR") or ".") / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log = log_dir / "backend.log"
    if log.exists() and log.stat().st_size > 5_000_000:   # keep it small: start over
        log.replace(log.with_suffix(".old"))
    stream = open(log, "a", buffering=1, encoding="utf-8")
    sys.stdout = sys.stderr = stream


def main() -> None:
    multiprocessing.freeze_support()
    if getattr(sys, "frozen", False) or sys.stdout is None:
        _redirect_output()

    import logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )

    import uvicorn
    from backend.main import app     # imported (not a string) so PyInstaller sees it

    port = int(os.environ.get("RESECTOR_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_config=None,
                loop="asyncio", http="h11", ws="none", lifespan="on")


if __name__ == "__main__":
    main()
