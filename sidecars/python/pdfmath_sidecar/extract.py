"""
sidecars/python/math/extract.py

FastAPI router and math extraction logic via pdfmath.
Extracts math expressions from PDFs into LaTeX with delimiters:
- \( ... \) for inline math
- \[ ... \] for display math
"""

import base64
import os
import tempfile
import traceback
from typing import Any, Dict, List, Optional
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/v1/math", tags=["math"])


class MathExtractRequest(BaseModel):
    pdf_base64: str


def _resolve_style(style_val: Any):
    try:
        from pdfmath.fonts.mathparams import Style
        if isinstance(style_val, Style):
            return style_val
        name = str(style_val or "").lower()
        if name == "display":
            return Style.DISPLAY
        elif name == "text":
            return Style.TEXT
        elif name == "script":
            return Style.SCRIPT
        elif name == "scriptscript":
            return Style.SCRIPTSCRIPT
        return Style.DISPLAY
    except Exception:
        return None


def extract_math_from_pdf(pdf_bytes: bytes) -> Dict[str, Any]:
    """
    Extracts math equations from PDF bytes using pdfmath.
    Never raises an uncaught exception; always returns a structured dictionary.
    """
    if not pdf_bytes or len(pdf_bytes) == 0:
        return {
            "success": True,
            "latex_blocks": [],
            "stats": {"total": 0, "extracted": 0, "failed": 0},
            "error": None,
        }

    tmp_path: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp_path = tmp.name
            tmp.write(pdf_bytes)

        from pdfmath.extraction.pdfminer_backend import extract_pages
        from pdfmath.detection import find_equations
        from pdfmath.parse.driver import parse_region
        from pdfmath.latex.serializer import to_latex
        from pdfmath.fonts.mathparams import Style

        pages = list(extract_pages(tmp_path))
        latex_blocks: List[Dict[str, Any]] = []
        failed = 0
        total_equations = 0

        for page in pages:
            try:
                regions = find_equations(page, inline=True)
            except Exception:
                continue

            for r in regions:
                total_equations += 1
                try:
                    style_obj = _resolve_style(getattr(r, "style", "display")) or Style.DISPLAY
                    src, tree, _ctx = parse_region(page, r.bbox, style_obj)
                    rendered = to_latex(tree)
                    latex_str = (rendered.latex or "").strip()

                    if not latex_str:
                        failed += 1
                        continue

                    # Extract original glyph text
                    orig_chars = []
                    for g in src.glyphs:
                        u = getattr(g, "unicode", None)
                        if u is None:
                            code = getattr(g, "char_code", None)
                            if isinstance(code, int) and 32 <= code <= 126:
                                u = chr(code)
                            else:
                                u = ""
                        orig_chars.append(str(u))

                    orig_text = "".join(orig_chars).strip() or latex_str

                    is_display = getattr(r, "style", "display") == "display"
                    wrapped_latex = f"\\[{latex_str}\\]" if is_display else f"\\({latex_str}\\)"

                    latex_blocks.append({
                        "page": int(page.page),
                        "text_original": orig_text,
                        "latex": wrapped_latex,
                    })
                except Exception:
                    failed += 1

        return {
            "success": True,
            "latex_blocks": latex_blocks,
            "stats": {
                "total": total_equations,
                "extracted": len(latex_blocks),
                "failed": failed,
            },
            "error": None,
        }
    except Exception as exc:
        return {
            "success": False,
            "latex_blocks": [],
            "stats": {"total": 0, "extracted": 0, "failed": 0},
            "error": f"{type(exc).__name__}: {str(exc)}",
        }
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


@router.post("/extract")
async def extract_math_endpoint(payload: MathExtractRequest):
    try:
        raw_b64 = payload.pdf_base64 or ""
        pdf_bytes = base64.b64decode(raw_b64)
    except Exception as exc:
        return {
            "success": False,
            "latex_blocks": [],
            "stats": {"total": 0, "extracted": 0, "failed": 0},
            "error": f"Invalid base64 payload: {str(exc)}",
        }

    return extract_math_from_pdf(pdf_bytes)

