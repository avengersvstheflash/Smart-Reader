import os
import sys

# Ensure module directory is in sys.path (supports both dev and PyInstaller frozen mode)
if getattr(sys, 'frozen', False):
    bundle_dir = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
else:
    bundle_dir = os.path.dirname(os.path.abspath(__file__))

if bundle_dir not in sys.path:
    sys.path.insert(0, bundle_dir)

# Model cache directory isolation (S12a)
# Guarantees neural models write to %LOCALAPPDATA%\Omnitome\models\ rather than install directory
model_dir = os.environ.get("OMNITOME_MODEL_DIR")
if not model_dir:
    if getattr(sys, "frozen", False):
        local_app_data = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
        model_dir = os.path.join(local_app_data, "Omnitome", "models")
    else:
        if sys.platform == "win32":
            local_app_data = os.environ.get("LOCALAPPDATA", os.path.expanduser("~\\AppData\\Local"))
            candidate = os.path.join(local_app_data, "Omnitome", "models")
            model_dir = candidate if os.path.exists(candidate) else os.path.join(bundle_dir, "models")
        else:
            model_dir = os.path.join(bundle_dir, "models")

os.makedirs(model_dir, exist_ok=True)
os.environ.setdefault("OMNITOME_MODEL_DIR", model_dir)
os.environ.setdefault("HF_HOME", os.path.join(model_dir, "huggingface"))
os.environ.setdefault("SENTENCE_TRANSFORMERS_HOME", os.path.join(model_dir, "sentence_transformers"))
os.environ.setdefault("PADDLE_HOME", os.path.join(model_dir, "paddle"))
os.environ.setdefault("PADDLEOCR_HOME", os.path.join(model_dir, "paddleocr"))
os.environ.setdefault("OMNITOME_KOKORO_DIR", os.path.join(model_dir, "kokoro"))
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_OFFLINE", "1")

import torch  # noqa: F401 — load before PaddleOCR to avoid WinError 127

os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'expandable_segments:True')

import threading
from common import setup_system_io
setup_system_io()

from fastapi import FastAPI, status
from fastapi.responses import JSONResponse
import uvicorn

from lifecycle import lifecycle_manager

from ocr.routes import router as ocr_router, is_ocr_ready
from nlp.routes import router as nlp_router
from embed.routes import router as embed_router, is_embed_installed
# F32.1: parse_router mounts /v1/parse (docx, rtf, and structure detection)
from parse.routes import router as parse_router
# F31: math_router mounts /v1/math
from pdfmath_sidecar.extract import router as math_router
from tts.routes import router as tts_router

app = FastAPI(title="Smart Reader Python Sidecar", version="1.0.0")

app.include_router(ocr_router)
app.include_router(nlp_router)
app.include_router(embed_router)
app.include_router(parse_router)
app.include_router(math_router)
app.include_router(tts_router)

@app.on_event("startup")
def on_startup():
    # Warm BGE-M3 in background on startup only if model weights are installed.
    # Other models (reranker, ocr, tts) are loaded lazily on their first request
    # to eliminate VRAM thrashing and CUDA allocator contention on 4GB GPUs (RTX 3050).
    if is_embed_installed():
        threading.Thread(target=lambda: lifecycle_manager.warm('embed'), daemon=True).start()
    else:
        print("[Boot] BGE-M3 model weights missing — skipping startup warmup thread.")
    # F43 Phase 3: Start background daemon eviction tick
    lifecycle_manager.start_daemon()


@app.on_event("shutdown")
def on_shutdown():
    # F43 Phase 3: Stop background daemon eviction tick
    lifecycle_manager.stop_daemon()


@app.get("/v1/health")
def health_check():
    return {
        "status": "ok",
        "service": "python-sidecar",
        "version": "1.0.0",
        "ready": is_ocr_ready()
    }

@app.get("/v1/lifecycle/status")
async def lifecycle_status(model: str | None = None):
    full = lifecycle_manager.status()
    if model:
        model_info = full.get("models", {}).get(model, {})
        return {
            "model": model,
            "state": model_info.get("state"),
            "in_flight": model_info.get("in_flight", 0),
            "idle_seconds": model_info.get("idle_seconds"),
        }
    return full

@app.post("/v1/lifecycle/warm")
def lifecycle_warm(model: str):
    if not lifecycle_manager.is_registered(model):
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "unknown_model", "model": model}
        )
    prev_state = lifecycle_manager.get_state(model)
    ok = lifecycle_manager.warm(model)
    curr_state = lifecycle_manager.get_state(model)
    return {"ok": ok, "previous_state": prev_state, "current_state": curr_state}

@app.post("/v1/lifecycle/unload")
def lifecycle_unload(model: str):
    if not lifecycle_manager.is_registered(model):
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "unknown_model", "model": model}
        )
    if lifecycle_manager.is_busy(model):
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "error": "model_busy",
                "model": model,
                "in_flight": lifecycle_manager.get_in_flight(model)
            }
        )
    prev_state = lifecycle_manager.get_state(model)
    ok = lifecycle_manager.unload(model)
    curr_state = lifecycle_manager.get_state(model)
    return {"ok": ok, "previous_state": prev_state, "current_state": curr_state}

if __name__ == "__main__":
    import argparse
    import socket

    parser = argparse.ArgumentParser(description="Omnitome Python Sidecar")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on (0 for ephemeral)")
    args = parser.parse_args()

    if args.port == 0:
        # Zero-TOCTOU socket allocation: bind, listen, and hand live socket directly to Uvicorn
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(("127.0.0.1", 0))
        sock.listen(5)
        actual_port = sock.getsockname()[1]

        # Emit deterministic handshake line
        print(f"__OMNITOME_BOOT__ python-sidecar port={actual_port}", flush=True)

        cfg = uvicorn.Config(app, host="127.0.0.1", log_level="info")
        srv = uvicorn.Server(cfg)
        srv.run(sockets=[sock])
    else:
        print(f"__OMNITOME_BOOT__ python-sidecar port={args.port}", flush=True)
        uvicorn.run(app, host="127.0.0.1", port=args.port)