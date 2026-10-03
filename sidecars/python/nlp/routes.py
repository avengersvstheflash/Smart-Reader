import sys
import threading
from typing import List, Optional

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import pysbd

router = APIRouter(prefix="", tags=["nlp"])

_reranker = None
_reranker_lock = threading.Lock()
_is_warming = False

def _load_reranker_worker():
    global _reranker, _is_warming
    try:
        import torch
        from sentence_transformers import CrossEncoder

        # 5.8.0i: prefer GPU when available. Cross-encoder on CPU is 20-50x
        # slower than GPU. Auto-detect so the same sidecar works on both.
        if torch.cuda.is_available():
            device = "cuda"
            gpu_name = torch.cuda.get_device_name(0)
            print(f"[Warmup] Reranker using GPU: {gpu_name}")
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            device = "mps"
            print("[Warmup] Reranker using Apple Metal (MPS)")
        else:
            device = "cpu"
            print("[Warmup] Reranker using CPU (no GPU detected — expect slower inference)")

        model = CrossEncoder("BAAI/bge-reranker-v2-m3", device=device)

        # 5.8.0i: run a dummy scoring pass to trigger JIT/kernel compilation
        # and lazy memory allocation. Without this, the FIRST real call is
        # slow on both CPU and GPU (cuda kernel JIT, memory arena setup).
        _ = model.predict([("warmup query", "warmup passage")])

        with _reranker_lock:
            _reranker = model
            _is_warming = False
        print(f"[Warmup] BGE reranker ready on {device} (warmup inference complete)")
    except Exception as e:
        print(f"[NLP Error] Reranker warmup failed: {e}", file=sys.stderr)
        with _reranker_lock:
            _is_warming = False


def start_reranker_warmup():
    """
    5.8.0i: Kick off reranker model loading in a background thread at sidecar boot.
    Prevents the 503 RERANKER_WARMING window during early synthesis calls.
    Safe to call multiple times — no-op if the model is already loaded or loading.
    """
    global _is_warming
    with _reranker_lock:
        if _reranker is not None or _is_warming:
            return
        _is_warming = True
    print("[Warmup] Starting BGE reranker (bge-reranker-v2-m3) background warm-up...")
    threading.Thread(target=_load_reranker_worker, daemon=True).start()


class RerankCandidate(BaseModel):
    id: str
    text: str

class RerankRequest(BaseModel):
    query: str
    candidates: List[RerankCandidate]


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

import math
import re

class SliceRequest(BaseModel):
    sections: List[dict]

@router.post("/v1/nlp/slice")
async def nlp_slice(req: SliceRequest):
    """
    Slices candidate sections into evenly distributed source units of ~1,500-2,500 words.

    Product vision: source processing unit = 1,500-2,500 words. Omni Chapter output
    target = 250-360 words, giving ~7:1 compression.

    History: Phase 5.7.2 Session 2b (2026-10-01) introduced a dynamic chapter budget
    for sources >=5000 words but mis-set the target to 8,500 words with a hard cap of
    8 units, producing 8,500-word source units and thus 4-6:1 effective ratios.
    5.8.0b/c (2026-10-03) corrects this to a unified 2,000-word target.
    """
    try:
        sections = req.sections
        if not sections:
            return {"units": []}

        def get_word_count(sec: dict) -> int:
            wc = sec.get("wordCount")
            if isinstance(wc, (int, float)) and wc > 0:
                return int(wc)
            text = sec.get("content") or sec.get("textContent")
            if text:
                return len([w for w in str(text).strip().split() if w])
            return 250

        # Phase 4.24 Flatten
        flattened_sections = []
        for s_idx, sec in enumerate(sections):
            sec_words = get_word_count(sec)
            if sec_words <= 2500:
                flattened_sections.append(sec)
                continue

            original_section_id = sec.get("sectionId") or sec.get("id") or f"section-{s_idx}"
            text = str(sec.get("content") or sec.get("textContent") or "").strip()

            if not text:
                target_count = math.ceil(sec_words / 2000.0)
                piece_size = math.floor(sec_words / target_count)
                remaining = sec_words
                for p_idx in range(target_count):
                    piece_words = remaining if p_idx == target_count - 1 else piece_size
                    remaining -= piece_words
                    piece = dict(sec)
                    piece["sectionId"] = f"{original_section_id}-p{p_idx}"
                    if "id" in sec:
                        piece["id"] = f"{original_section_id}-p{p_idx}"
                    piece["wordCount"] = piece_words
                    flattened_sections.append(piece)
                continue

            paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
            if not paragraphs:
                paragraphs = [text]

            blocks = []
            for para in paragraphs:
                para_words = len([w for w in para.split() if w])
                if para_words <= 2500:
                    blocks.append({"text": para, "words": para_words})
                else:
                    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', para) if s.strip()]
                    for sentence in sentences:
                        sent_words = len([w for w in sentence.split() if w])
                        if sent_words <= 2500:
                            blocks.append({"text": sentence, "words": sent_words})
                        else:
                            words = [w for w in sentence.split() if w]
                            for w_idx in range(0, len(words), 2000):
                                sub_words = words[w_idx:w_idx+2000]
                                blocks.append({"text": " ".join(sub_words), "words": len(sub_words)})

            current_piece_blocks = []
            current_piece_words = 0
            piece_index = 0

            def emit_piece(blocks_to_emit, words_count):
                nonlocal piece_index
                piece_text = "\n\n".join(b["text"] for b in blocks_to_emit)
                piece = dict(sec)
                piece["sectionId"] = f"{original_section_id}-p{piece_index}"
                if "id" in sec:
                    piece["id"] = f"{original_section_id}-p{piece_index}"
                piece["wordCount"] = words_count
                if "content" in sec:
                    piece["content"] = piece_text
                if "textContent" in sec:
                    piece["textContent"] = piece_text
                if "content" not in sec and "textContent" not in sec:
                    piece["content"] = piece_text
                    piece["textContent"] = piece_text
                flattened_sections.append(piece)
                piece_index += 1

            for block in blocks:
                if current_piece_words > 0 and (current_piece_words + block["words"]) > 2500:
                    emit_piece(current_piece_blocks, current_piece_words)
                    current_piece_blocks = [block]
                    current_piece_words = block["words"]
                else:
                    current_piece_blocks.append(block)
                    current_piece_words += block["words"]

            if current_piece_blocks:
                emit_piece(current_piece_blocks, current_piece_words)

        sections = flattened_sections
        section_words = [get_word_count(s) for s in sections]
        W = sum(section_words)

        if W < 3000 or len(sections) <= 1:
            return {"units": [{"sections": sections, "wordCount": W}]}

        # 5.8.0b/c: product vision targets 1,500-2,500-word source units.
        # Unified target of 2,000 words; upper bound is naturally len(sections).
        target_words_per_unit = 2000
        N = max(1, min(len(sections), round(W / target_words_per_unit)))

        if N <= 1:
            return {"units": [{"sections": sections, "wordCount": W}]}

        S = W / N
        cum_words = [0] * (len(sections) + 1)
        for i in range(len(sections)):
            cum_words[i+1] = cum_words[i] + section_words[i]

        min_unit_words = min(1500, round(S * 0.45))
        splits = [0]

        for i in range(1, N):
            target = i * S
            prev_split = splits[i - 1]

            best_k = prev_split + 1
            best_score = float('inf')

            for k in range(prev_split + 1, len(sections)):
                words_in_unit = cum_words[k] - cum_words[prev_split]
                words_remaining = W - cum_words[k]
                remaining_units = N - i

                if words_in_unit < min_unit_words:
                    continue
                if words_remaining < remaining_units * min_unit_words:
                    break

                word_diff = abs(cum_words[k] - target)
                sec_title = str(sections[k].get("sectionTitle") or sections[k].get("title") or "").strip()
                prev_sec_title = str(sections[k-1].get("sectionTitle") or sections[k-1].get("title") or "").strip()

                priority_bonus = 0.0
                is_chapter_break = bool(re.match(r'^(?i)(?:chapter|part)\s+\d+', sec_title))
                is_major_section = bool(re.match(r'^\d+\.\d+\b', sec_title)) and not bool(re.match(r'^\d+\.\d+\.\d+', sec_title))
                is_heading_change = sec_title != prev_sec_title

                if is_chapter_break:
                    priority_bonus = S * 0.35
                elif is_major_section:
                    priority_bonus = S * 0.15
                elif is_heading_change:
                    priority_bonus = S * 0.05

                score = word_diff - priority_bonus
                if score < best_score:
                    best_score = score
                    best_k = k

            splits.append(best_k)

        splits.append(len(sections))

        units = []
        for i in range(len(splits) - 1):
            unit_sections = sections[splits[i]:splits[i+1]]
            unit_words = sum(section_words[splits[i]:splits[i+1]])
            units.append({
                "sections": unit_sections,
                "wordCount": unit_words
            })

        if len(units) > 1 and units[-1]["wordCount"] < min_unit_words:
            last = units.pop()
            units[-1]["sections"].extend(last["sections"])
            units[-1]["wordCount"] += last["wordCount"]

        return {"units": units}

    except Exception as err:
        print(f"[NLP Error] Slicing failed: {err}", file=sys.stderr)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "code": "NLP_PROCESSING_FAILED",
                "message": f"Slicing failed: {str(err)}"
            }
        )

@router.post("/v1/nlp/rerank")
async def nlp_rerank(req: RerankRequest):
    global _reranker, _is_warming

    candidates = req.candidates
    n = len(candidates) if candidates else 0
    print(f"[Routing: NLP] Endpoint: /v1/nlp/rerank | Candidates: {n} | Warmed: {_reranker is not None}")

    if not candidates or n == 0:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "status": "error",
                "code": "EMPTY_CANDIDATES",
                "message": "No candidates provided"
            }
        )

    with _reranker_lock:
        if _reranker is None:
            if not _is_warming:
                _is_warming = True
                threading.Thread(target=_load_reranker_worker, daemon=True).start()
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={
                    "status": "error",
                    "code": "RERANKER_WARMING",
                    "message": "Reranker is loading"
                }
            )
        model = _reranker

    try:
        query = req.query
        pairs = [(query, c.text) for c in candidates]
        raw_scores = model.predict(pairs)
        if hasattr(raw_scores, "tolist"):
            scores_list = raw_scores.tolist()
        elif isinstance(raw_scores, (list, tuple)):
            scores_list = [float(s) for s in raw_scores]
        else:
            scores_list = [float(raw_scores)]

        scores_out = []
        for i, c in enumerate(candidates):
            score_val = float(scores_list[i]) if i < len(scores_list) else 0.0
            scores_out.append({
                "id": c.id,
                "score": score_val
            })

        return {
            "status": "success",
            "scores": scores_out,
            "model": "bge-reranker-v2-m3"
        }
    except Exception as err:
        print(f"[NLP Error] Reranking failed: {err}", file=sys.stderr)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "code": "RERANKER_FAILED",
                "message": str(err)
            }
        )