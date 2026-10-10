import os
import sys
import time
import threading
from typing import List

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from lifecycle import lifecycle_manager, ModelState

router = APIRouter(prefix="", tags=["embed"])


def _load_embedder():
    import torch
    from sentence_transformers import SentenceTransformer
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model_kwargs = {"torch_dtype": torch.float16} if device == "cuda" else {}
    print(f"[Embed Warmup] Loading BGE-M3 (device={device}, fp16={device == 'cuda'})...")
    t0 = time.time()
    try:
        model = SentenceTransformer("BAAI/bge-m3", model_kwargs=model_kwargs, device=device)
        print(f"[Embed Warmup] BGE-M3 ready on {device} in {round(time.time() - t0, 2)}s")
        return model
    except Exception as e:
        print(f"[Embed Error] Model warmup failed: {e}", file=sys.stderr)
        raise


def _unload_embedder(model=None):
    print("[Embed] Unloading BGE-M3...")
    del model


lifecycle_manager.register(
    name="embed",
    loader=_load_embedder,
    unloader=_unload_embedder,
    idle_ttl_sec=int(os.environ.get("SIDECAR_EMBED_IDLE_SEC", "900"))
)


def start_embed_warmup():
    """Starts background warmup of BGE-M3 via lifecycle manager."""
    threading.Thread(target=lambda: lifecycle_manager.warm("embed"), daemon=True).start()


class EmbedBatchRequest(BaseModel):
    texts: List[str]


@router.post("/v1/embed/batch")
def embed_batch(req: EmbedBatchRequest):
    if req.texts is None or len(req.texts) == 0:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "status": "error",
                "code": "EMPTY_TEXTS",
                "message": "No texts provided"
            }
        )

    if len(req.texts) > 32:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={
                "status": "error",
                "code": "EMBED_BATCH_TOO_LARGE",
                "message": f"Batch size {len(req.texts)} exceeds server limit 32",
            }
        )

    if lifecycle_manager.get_state("embed") == ModelState.LOADING.value:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "error",
                "code": "EMBED_MODEL_WARMING",
                "message": "BGE-M3 is loading"
            }
        )

    try:
        with lifecycle_manager.acquire("embed") as embedder:
            if embedder is None:
                raise RuntimeError("BGE-M3 model instance is not available")
            t0 = time.time()
            vectors = embedder.encode(req.texts, normalize_embeddings=True)
            embeddings = vectors.tolist() if hasattr(vectors, "tolist") else [v.tolist() for v in vectors]
            dur_ms = round((time.time() - t0) * 1000, 1)
            print(f"[Routing: Embed] Encoded {len(req.texts)} texts in {dur_ms}ms")

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

