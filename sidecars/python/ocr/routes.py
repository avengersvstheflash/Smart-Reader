import io
import os
import sys
import threading
import time
from typing import List, Dict, Any, Optional

import fitz  # PyMuPDF
import numpy as np
from fastapi import APIRouter, UploadFile, File, status
from fastapi.responses import JSONResponse
from paddleocr import PaddleOCR

router = APIRouter(prefix="", tags=["ocr"])

from lifecycle import lifecycle_manager, ModelState

warmup_duration_sec: float = 0.0

def _load_ocr():
    """Initializes PaddleOCR and warms up weights in memory."""
    global warmup_duration_sec
    print("[Warmup] Starting PaddleOCR (ch_PP-OCRv4) background warm-up...")
    t0 = time.time()
    try:
        cpu_count = os.cpu_count() or 8
        cpu_threads = min(12, max(4, cpu_count))
        try:
            engine = PaddleOCR(
                use_angle_cls=True,
                lang="ch",
                show_log=False,
                enable_mkldnn=True,
                cpu_threads=cpu_threads,
            )
            blank_img = np.ones((64, 64, 3), dtype=np.uint8) * 255
            engine.ocr(blank_img, cls=True)
            print(f"[Warmup] PaddleOCR initialized with MKLDNN enabled ({cpu_threads} threads)")
        except Exception as mkldnn_err:
            print(f"[Warmup] MKLDNN init failed ({mkldnn_err}), falling back to standard CPU engine")
            engine = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
            blank_img = np.ones((64, 64, 3), dtype=np.uint8) * 255
            engine.ocr(blank_img, cls=True)

        warmup_duration_sec = round(time.time() - t0, 2)
        print(f"[Warmup] PaddleOCR engine ready in {warmup_duration_sec}s")
        return engine
    except Exception as e:
        print(f"[Warmup] PaddleOCR initialization failed: {e}", file=sys.stderr)
        raise

def _unload_ocr(engine=None):
    print("[OCR] Unloading PaddleOCR engine...")
    del engine

lifecycle_manager.register(
    name="ocr",
    loader=_load_ocr,
    unloader=_unload_ocr,
    idle_ttl_sec=int(os.environ.get("SIDECAR_OCR_IDLE_SEC", "300"))
)

def start_ocr_warmup():
    """Starts the background thread for OCR warm-up via lifecycle manager."""
    threading.Thread(target=lambda: lifecycle_manager.warm("ocr"), daemon=True).start()

def is_ocr_ready() -> bool:
    """Returns whether the OCR engine is initialized and ready."""
    return lifecycle_manager.get_state("ocr") == ModelState.LOADED.value

@router.get("/v1/ready")
def readiness_probe():
    """Returns 200 OK once OCR weights are in memory; 503 while warming up."""
    if not is_ocr_ready():
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "warming",
                "message": "OCR engine is warming up",
                "model": "ch_PP-OCRv4"
            }
        )
    return {
        "status": "ready",
        "model": "ch_PP-OCRv4",
        "warmup_sec": warmup_duration_sec
    }

from fastapi.concurrency import run_in_threadpool

def _ocr_pdf_sync(content, engine=None):
    if engine is None:
        with lifecycle_manager.acquire("ocr") as eng:
            if eng is None:
                raise RuntimeError("OCR engine instance is not available")
            return _ocr_pdf_sync(content, eng)

    doc = fitz.open(stream=content, filetype="pdf")
    pages_out: List[Dict[str, Any]] = []
    all_confidences: List[float] = []
    total_extracted_chars = 0
    total_supported_chars = 0

    target_dpi = int(os.environ.get("OCR_DPI", "175"))

    for page_idx in range(len(doc)):
        page_lines: List[str] = []
        try:
            page = doc[page_idx]
            rect = page.rect
            max_dim_pt = max(rect.width, rect.height)
            dpi = target_dpi
            if max_dim_pt > 1200:
                dpi = max(96, int(target_dpi * (1200 / max_dim_pt)))

            # Direct sRGB rasterization: handles CMYK, Grayscale, Alpha, Stride natively in C++
            pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csRGB, alpha=False)
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.h, pix.w, 3))

            # Dark-mode boost: invert if page has very dark background (white text on dark)
            if img.mean() < 75.0:
                img = 255 - img

            ocr_res = engine.ocr(img, cls=True)

            if ocr_res and ocr_res[0]:
                for line in ocr_res[0]:
                    if not (isinstance(line, (list, tuple)) and len(line) >= 2):
                        continue
                    line_data = line[1]
                    if not (isinstance(line_data, (list, tuple)) and len(line_data) >= 2):
                        continue
                    text, conf = line_data[0], line_data[1]
                    cleaned = str(text).strip()
                    if cleaned:
                        page_lines.append(cleaned)
                        all_confidences.append(float(conf))
                        total_extracted_chars += len(cleaned)
                        for ch in cleaned:
                            # Count ASCII printable (English letters, digits, punctuation, code) and CJK
                            if 32 <= ord(ch) <= 126 or ('\u4e00' <= ch <= '\u9fff') or ('\u3040' <= ch <= '\u30ff'):
                                total_supported_chars += 1
        except Exception as page_err:
            print(f"[OCR Warning] Failed to process page {page_idx + 1}: {page_err}", file=sys.stderr)

        page_text = "\n\n".join(page_lines)
        pages_out.append({
            "num": page_idx + 1,
            "text": page_text
        })

    # Diagnostic Language Guard:
    # Protects against feeding garbage into downstream models when document is
    # in an unsupported language (e.g. Cyrillic, Greek, Arabic) forced through 'ch' engine.
    # Documents in English/Chinese/ASCII (including degraded/ugly scans, code, numbers)
    # have high supported_chars ratio and are accepted regardless of low confidence.
    if len(all_confidences) >= 3 and total_extracted_chars > 0:
        avg_conf = sum(all_confidences) / len(all_confidences)
        supported_ratio = total_supported_chars / total_extracted_chars

        # Only reject if document clearly belongs to an unsupported script
        # (low supported character ratio AND low confidence)
        if supported_ratio < 0.20 and avg_conf < 0.80:
            print(f"[LanguageGuard] Rejected unsupported language document: avg_confidence={avg_conf:.4f}, supported_ratio={supported_ratio:.2f}")
            return JSONResponse(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                content={
                    "status": "error",
                    "code": "OCR_LANGUAGE_UNSUPPORTED",
                    "message": "OCR language not yet supported for this document",
                    "avg_confidence": round(avg_conf, 4)
                }
            )

    return {
        "status": "success",
        "pages": pages_out,
        "model": "ch_PP-OCRv4"
    }

@router.post("/v1/ocr/pdf")
async def ocr_pdf(file: UploadFile = File(...)):
    """
    Extracts text from scanned/image PDF using PaddleOCR.
    Rasterizes pages at 200 DPI using PyMuPDF (fitz).
    Returns { status: 'success', pages: [{ num, text }], model: 'ch_PP-OCRv4' }
    """
    if lifecycle_manager.get_state("ocr") == ModelState.LOADING.value:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "error",
                "code": "OCR_SIDECAR_WARMING",
                "message": "OCR engine is still warming up"
            }
        )

    try:
        content = await file.read()
        if not content:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "status": "error",
                    "code": "EMPTY_PAYLOAD",
                    "message": "Uploaded PDF file is empty"
                }
            )

        return await run_in_threadpool(_ocr_pdf_sync, content)

    except Exception as err:
        print(f"[OCR Error] Failed to process PDF: {err}", file=sys.stderr)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "code": "OCR_PROCESSING_FAILED",
                "message": f"Failed to process PDF: {str(err)}"
            }
        )
