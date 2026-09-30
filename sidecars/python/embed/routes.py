import sys
import threading
from typing import List
import numpy as np

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="", tags=["embed"])

_model = None
_model_lock = threading.Lock()
_is_warming = False

def _load_model_worker():
    global _model, _is_warming
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("BAAI/bge-m3")
        with _model_lock:
            _model = model
            _is_warming = False
    except Exception as e:
        print(f"[Embed Error] Model warmup failed: {e}", file=sys.stderr)
        with _model_lock:
            _is_warming = False

class EmbedBatchRequest(BaseModel):
    texts: List[str]

@router.post("/v1/embed/batch")
async def embed_batch(req: EmbedBatchRequest):
    global _model, _is_warming

    if req.texts is None or len(req.texts) == 0:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "status": "error",
                "code": "EMPTY_TEXTS",
                "message": "No texts provided"
            }
        )

    with _model_lock:
        if _model is None:
            if not _is_warming:
                _is_warming = True
                threading.Thread(target=_load_model_worker, daemon=True).start()
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={
                    "status": "error",
                    "code": "EMBED_MODEL_WARMING",
                    "message": "BGE-M3 is loading"
                }
            )
        model = _model

    try:
        vectors = model.encode(req.texts, normalize_embeddings=True)
        embeddings = vectors.tolist() if hasattr(vectors, "tolist") else [v.tolist() for v in vectors]
        
        return {
            "status": "success",
            "embeddings": embeddings,
            "model": "bge-m3-python-fp32",
            "dims": 1024
        }
    except Exception as err:
        print(f"[Embed Error] Processing failed: {err}", file=sys.stderr)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "code": "EMBED_PROCESSING_FAILED",
                "message": f"Embedding computation failed: {str(err)}"
            }
        )
