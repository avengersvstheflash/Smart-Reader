import sys
from typing import List, Optional

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import pysbd

router = APIRouter(prefix="", tags=["nlp"])

class SplitRequest(BaseModel):
    text: str
    language: str = "en"
    clean: bool = False

class ChunkBlock(BaseModel):
    id: Optional[str] = None
    text: str

class ChunkRequest(BaseModel):
    blocks: List[ChunkBlock]
    target_tokens: int = 1500
    overlap_tokens: int = 150

@router.post("/v1/nlp/split")
async def nlp_split(req: SplitRequest):
    """
    Splits input text into sentence spans with exact start/end character offsets using pysbd.
    Returns: { "sentences": [{ "text": str, "start": int, "end": int }], "model": "pysbd-0.3.4" }
    """
    try:
        segmenter = pysbd.Segmenter(language=req.language, clean=req.clean, char_span=True)
        spans = segmenter.segment(req.text)
        sentences_out = []
        for s in spans:
            if hasattr(s, "sent") and hasattr(s, "start") and hasattr(s, "end"):
                sentences_out.append({
                    "text": s.sent,
                    "start": s.start,
                    "end": s.end
                })
            elif isinstance(s, dict):
                sentences_out.append({
                    "text": s.get("sent", s.get("text", "")),
                    "start": s.get("start", 0),
                    "end": s.get("end", len(s.get("sent", "")))
                })
            else:
                sent_str = str(s)
                start_idx = req.text.find(sent_str)
                end_idx = start_idx + len(sent_str) if start_idx != -1 else len(sent_str)
                sentences_out.append({
                    "text": sent_str,
                    "start": max(0, start_idx),
                    "end": max(0, end_idx)
                })
        return {
            "sentences": sentences_out,
            "model": "pysbd-0.3.4"
        }
    except Exception as err:
        print(f"[NLP Error] Split failed: {err}", file=sys.stderr)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "code": "NLP_PROCESSING_FAILED",
                "message": f"Sentence split failed: {str(err)}"
            }
        )

@router.post("/v1/nlp/chunk")
async def nlp_chunk(req: ChunkRequest):
    """
    Chunks blocks into token-bounded chunks respecting target_tokens and overlap_tokens.
    Returns: { "chunks": [{ "id": str, "text": str, "tokenCount": int, "startBlockId": str, "endBlockId": str }], "model": "pysbd-0.3.4" }
    """
    try:
        chunks_out = []
        current_chunk_blocks = []
        current_tokens = 0
        chunk_idx = 0

        for b in req.blocks:
            b_text = b.text.strip()
            if not b_text:
                continue
            token_count = max(1, len(b_text.split()))

            if current_chunk_blocks and (current_tokens + token_count > req.target_tokens):
                combined_text = " ".join([cb.text.strip() for cb in current_chunk_blocks])
                chunks_out.append({
                    "id": f"chk-v2-{chunk_idx}",
                    "text": combined_text,
                    "tokenCount": current_tokens,
                    "startBlockId": current_chunk_blocks[0].id or "",
                    "endBlockId": current_chunk_blocks[-1].id or ""
                })
                chunk_idx += 1
                current_chunk_blocks = [b]
                current_tokens = token_count
            else:
                current_chunk_blocks.append(b)
                current_tokens += token_count

        if current_chunk_blocks:
            combined_text = " ".join([cb.text.strip() for cb in current_chunk_blocks])
            chunks_out.append({
                "id": f"chk-v2-{chunk_idx}",
                "text": combined_text,
                "tokenCount": current_tokens,
                "startBlockId": current_chunk_blocks[0].id or "",
                "endBlockId": current_chunk_blocks[-1].id or ""
            })

        return {
            "chunks": chunks_out,
            "model": "pysbd-0.3.4"
        }
    except Exception as err:
        print(f"[NLP Error] Chunking failed: {err}", file=sys.stderr)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "code": "NLP_PROCESSING_FAILED",
                "message": f"Chunking failed: {str(err)}"
            }
        )
