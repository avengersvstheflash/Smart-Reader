import io
import sys
import threading
import time
from typing import List, Dict, Any, Optional

import fitz  # PyMuPDF
import numpy as np
from fastapi import FastAPI, UploadFile, File, Response, status
from fastapi.responses import JSONResponse
import uvicorn
from paddleocr import PaddleOCR

# Ensure UTF-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

app = FastAPI(title="Smart Reader Python Sidecar", version="1.0.0")

# Global state for OCR engine and readiness
ocr_engine: Optional[PaddleOCR] = None
is_ready: bool = False
warmup_duration_sec: float = 0.0

def warm_up_engine():
    """Initializes PaddleOCR and warms up weights in memory in background."""
    global ocr_engine, is_ready, warmup_duration_sec
    print("[Warmup] Starting PaddleOCR (ch_PP-OCRv4) background warm-up...")
    t0 = time.time()
    try:
        engine = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
        # Run a lightweight 64x64 blank image inference to load execution graph and weights into memory
        blank_img = np.ones((64, 64, 3), dtype=np.uint8) * 255
        engine.ocr(blank_img, cls=True)
        ocr_engine = engine
        warmup_duration_sec = round(time.time() - t0, 2)
        is_ready = True
        print(f"[Warmup] PaddleOCR engine ready in {warmup_duration_sec}s")
    except Exception as e:
        print(f"[Warmup] PaddleOCR initialization failed: {e}", file=sys.stderr)

@app.on_event("startup")
def on_startup():
    # Start background warm-up thread so /v1/health responds immediately
    thread = threading.Thread(target=warm_up_engine, daemon=True)
    thread.start()

@app.get("/v1/health")
def health_check():
    """Returns 200 OK immediately when HTTP server is listening."""
    return {
        "status": "ok",
        "service": "python-sidecar",
        "version": "1.0.0",
        "ready": is_ready
    }

@app.get("/v1/ready")
def readiness_probe():
    """Returns 200 OK once OCR weights are in memory; 503 while warming up."""
    if not is_ready:
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

@app.post("/v1/ocr/pdf")
async def ocr_pdf(file: UploadFile = File(...)):
    """
    Extracts text from scanned/image PDF using PaddleOCR.
    Rasterizes pages at 200 DPI using PyMuPDF (fitz).
    Returns { status: 'success', pages: [{ num, text }], model: 'ch_PP-OCRv4' }
    """
    if not is_ready or ocr_engine is None:
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

        doc = fitz.open(stream=content, filetype="pdf")
        pages_out: List[Dict[str, Any]] = []
        all_confidences: List[float] = []
        total_extracted_chars = 0

        for page_idx in range(len(doc)):
            page = doc[page_idx]
            # 200 DPI provides an optimal balance between recognition accuracy and CPU rasterization speed
            pix = page.get_pixmap(dpi=200)
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.h, pix.w, pix.n))
            if pix.n == 4:
                img = img[:, :, :3]

            ocr_res = ocr_engine.ocr(img, cls=True)
            page_lines: List[str] = []

            if ocr_res and ocr_res[0]:
                for line in ocr_res[0]:
                    text, conf = line[1]
                    cleaned = text.strip()
                    if cleaned:
                        page_lines.append(cleaned)
                        all_confidences.append(float(conf))
                        total_extracted_chars += len(cleaned)

            page_text = "\n\n".join(page_lines)
            pages_out.append({
                "num": page_idx + 1,
                "text": page_text
            })

        # Diagnostic Language Guard (Step 5 Decision):
        # 1. If document extracted text across pages, evaluate average line confidence.
        # Clean English print yields avg confidence > 0.90 (calibration: ~0.95+).
        # Foreign unsupported scripts forced through 'ch' yield severe degradation (e.g. Greek avg 0.54, Cyrillic 0.75).
        # We enforce a conservative 0.80 average confidence threshold for multi-line extractions.
        if len(all_confidences) >= 3:
            avg_conf = sum(all_confidences) / len(all_confidences)
            if avg_conf < 0.80:
                print(f"[LanguageGuard] Rejected document: average confidence {avg_conf:.4f} < 0.80 threshold")
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

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765)