import os
import sys

# Ensure sidecars/python directory is in sys.path
sys_path_dir = os.path.dirname(os.path.abspath(__file__))
if sys_path_dir not in sys.path:
    sys.path.insert(0, sys_path_dir)

from common import setup_system_io
setup_system_io()

from fastapi import FastAPI
import uvicorn

from ocr.routes import router as ocr_router, start_ocr_warmup, is_ocr_ready
from nlp.routes import router as nlp_router
from embed.routes import router as embed_router

app = FastAPI(title="Smart Reader Python Sidecar", version="1.0.0")

app.include_router(ocr_router)
app.include_router(nlp_router)
app.include_router(embed_router)

@app.on_event("startup")
def on_startup():
    start_ocr_warmup()

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
