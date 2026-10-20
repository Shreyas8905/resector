# PyInstaller spec: builds desktop/build-tmp/dist/resector-backend/ (onedir; onefile would unpack
# hundreds of MB on every launch). Run through desktop/scripts/build_backend.py.
import os
from PyInstaller.utils.hooks import collect_all, collect_submodules, collect_data_files, collect_dynamic_libs

ROOT = os.path.abspath(os.path.join(SPECPATH, "..", ".."))       # repo root (contains backend/)

datas, binaries, hiddenimports = [], [], []

# Packages that load data files / plugins / submodules dynamically
for pkg in (
    "tokenizers", "pypika", "posthog", "tiktoken", "tiktoken_ext", "pymupdf",
    "langchain_openai", "langchain_anthropic", "langchain_google_genai", "langchain_groq",
    "tavily", "langgraph", "langchain_core", "grpc",
):
    try:
        d, b, h = collect_all(pkg)
        datas += d; binaries += b; hiddenimports += h
    except Exception:
        pass          # optional package not installed

# chromadb and onnxruntime: collect_all would drag in their test suites, the Chroma HTTP server and the
# ONNX model tooling (hundreds of modules the app never uses and a few that fail to import).
def _slim(pkg, skip):
    global datas, binaries, hiddenimports
    datas += collect_data_files(pkg)
    binaries += collect_dynamic_libs(pkg)
    hiddenimports += collect_submodules(pkg, filter=lambda n: not any(x in n for x in skip))

_slim("chromadb", (".test", "chromadb.server", "chromadb.cli"))
_slim("onnxruntime", (".tools", ".transformers", ".quantization", ".datasets"))
hiddenimports += ["opentelemetry.sdk.trace", "opentelemetry.exporter.otlp.proto.grpc.trace_exporter"]

hiddenimports += collect_submodules("backend")
hiddenimports += [
    "uvicorn.logging", "uvicorn.loops.asyncio", "uvicorn.protocols.http.h11_impl",
    "uvicorn.lifespan.on", "multipart", "sqlalchemy.dialects.sqlite",
]

# The bundled embedding model must sit at <bundle>/backend/models (config.py looks next to itself).
# NOTE: backend/.env is intentionally NOT bundled: it can hold your personal API keys.
model_dir = os.path.join(ROOT, "backend", "models")
if os.path.isdir(model_dir):
    datas.append((model_dir, os.path.join("backend", "models")))

a = Analysis(
    [os.path.join(SPECPATH, "entry.py")],
    pathex=[ROOT],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter", "torch", "sentence_transformers", "matplotlib", "IPython", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="resector-backend",
          console=False, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, name="resector-backend", upx=False)
