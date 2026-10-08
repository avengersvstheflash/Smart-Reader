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

from fastapi import FastAPI
import uvicorn

from ocr.routes import router as ocr_router, start_ocr_warmup, is_ocr_ready
from nlp.routes import router as nlp_router, start_reranker_warmup
from embed.routes import router as embed_router
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

@app.get("/v1/health")
def health_check():
    return {
        "status": "ok",
        "service": "python-sidecar",
        "version": "1.0.0",
        "ready": is_ocr_ready()
    }

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765)