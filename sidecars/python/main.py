import os
import sys
import torch  # noqa: F401 — load before PaddleOCR to avoid WinError 127

os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'expandable_segments:True')

# Ensure sidecars/python directory is in sys.path
sys_path_dir = os.path.dirname(os.path.abspath(__file__))
if sys_path_dir not in sys.path:
    sys.path.insert(0, sys_path_dir)

from common import setup_system_io
setup_system_io()

from fastapi import FastAPI, status
from fastapi.responses import JSONResponse
import uvicorn

from lifecycle import lifecycle_manager

from ocr.routes import router as ocr_router, start_ocr_warmup, is_ocr_ready
from nlp.routes import router as nlp_router, start_reranker_warmup
from embed.routes import router as embed_router, start_embed_warmup
# F32.1: parse_router mounts /v1/parse (docx, rtf, and structure detection)
from parse.routes import router as parse_router
# F31: math_router mounts /v1/math
from pdfmath_sidecar.extract import router as math_router

app = FastAPI(title="Smart Reader Python Sidecar", version="1.0.0")

app.include_router(ocr_router)
app.include_router(nlp_router)
app.include_router(embed_router)
app.include_router(parse_router)
app.include_router(math_router)

@app.on_event("startup")
def on_startup():
    start_ocr_warmup()
    # 5.8.0i: warm the BGE reranker at boot so early synthesis calls
    # don't pay the 503 RERANKER_WARMING penalty during import.
    start_reranker_warmup()
    # Warm BGE-M3 in FP16 so first import doesn't pay warmup penalty
    start_embed_warmup()

@app.get("/v1/health")
def health_check():
    return {
        "status": "ok",
        "service": "python-sidecar",
        "version": "1.0.0",
        "ready": is_ocr_ready()
    }

@app.get("/v1/lifecycle/status")
def lifecycle_status():
    return lifecycle_manager.status()

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
    uvicorn.run(app, host="127.0.0.1", port=8765)