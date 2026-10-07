"""
Structure detection module for PDF documents.
Implements fast deterministic structure detection using PyMuPDF:
  Layer 0: doc.get_toc() -> embedded bookmarks (~5ms)
  Layer 1: font-size + numbering heuristics in Python (~50ms)
No LLM calls are made here.
"""

import re
import statistics
from typing import Any, Dict, List, Optional

try:
    import pymupdf
except ImportError:
    pymupdf = None


def detect_structure(pdf_bytes: bytes) -> Dict[str, Any]:
    """
    Analyze a PDF's structure without any LLM call.
    Returns:
      {
        "has_embedded_toc": bool,
        "toc": [{"level": int, "title": str, "page": int}, ...] | [],
        "heading_candidates": [
          {"page": int, "text": str, "font_size": float, "is_heading": bool},
          ...
        ],
        "front_matter_page_range": [int, int] | null,
        "back_matter_page_range": [int, int] | null,
        "estimated_chapter_count": int,
        "method": "toc" | "heuristic" | "none",
        "warnings": [str]
      }
    """
    warnings: List[str] = []

    empty_result = {
        "has_embedded_toc": False,
        "toc": [],
        "heading_candidates": [],
        "front_matter_page_range": None,
        "back_matter_page_range": None,
        "estimated_chapter_count": 0,
        "method": "none",
        "warnings": warnings,
    }

    if not pdf_bytes:
        warnings.append("empty_pdf_input")
        return empty_result

    if pymupdf is None:
        warnings.append("pymupdf_not_installed")
        return empty_result

    doc = None
    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        warnings.append(f"failed_to_open_pdf: {str(e)}")
        return empty_result

    try:
        # Pre-check encryption / password protection
        if getattr(doc, "is_encrypted", False) or getattr(doc, "needs_pass", 0):
            warnings.append("password_protected_pdf")
            return empty_result

        total_pages = doc.page_count
        if total_pages == 0:
            warnings.append("pdf_has_zero_pages")
            return empty_result

        # --- Layer 0: Embedded TOC detection ---
        has_embedded_toc = False
        toc_entries: List[Dict[str, Any]] = []

        try:
            raw_toc = doc.get_toc(simple=True)
            if raw_toc and len(raw_toc) >= 2:
                has_embedded_toc = True
                for entry in raw_toc:
                    if len(entry) >= 3:
                        toc_entries.append({
                            "level": int(entry[0]),
                            "title": str(entry[1]).strip(),
                            "page": int(entry[2])
                        })
        except Exception as toc_err:
            warnings.append(f"toc_extraction_error: {str(toc_err)}")

        # --- Layer 1: Heuristic structure extraction ---
        heading_candidates: List[Dict[str, Any]] = []
        front_matter_pages = set()
        back_matter_pages = set()
        first_body_page: Optional[int] = None

        fm_pattern = re.compile(
            r'\b(Contents|Table of Contents|Foreword|Preface|Acknowledgments?|Dedication|Copyright)\b',
            re.IGNORECASE
        )
        bm_pattern = re.compile(
            r'\b(Index|Subject Index|Author Index|Bibliography|Glossary|Appendix(?:\s+[A-Z0-9]+)?|References|Works Cited)\b',
            re.IGNORECASE
        )
        numbered_prefix_pattern = re.compile(
            r'^\d+\.?\s|^Chapter\s+\d+|^Part\s+([IVX]+|\d+)',
            re.IGNORECASE
        )
        copyright_pattern = re.compile(
            r'\b(Copyright|All rights reserved|ISBN(?:-1[03])?)\b',
            re.IGNORECASE
        )

        for page_idx in range(total_pages):
            page_num = page_idx + 1  # 1-indexed page number
            try:
                page = doc[page_idx]

                page_text = page.get_text("text") or ""
                words = page_text.split()
                if first_body_page is None and len(words) > 500:
                    first_body_page = page_num

                page_dict = page.get_text("dict") or {}
                blocks = page_dict.get("blocks", [])

                # Collect font sizes for median calculation
                font_sizes: List[float] = []
                for b in blocks:
                    for l in b.get("lines", []):
                        for s in l.get("spans", []):
                            stext = s.get("text", "").strip()
                            if stext:
                                font_sizes.append(float(s.get("size", 0.0)))

                page_median = statistics.median(font_sizes) if font_sizes else 10.0
                if page_median <= 0:
                    page_median = 10.0

                # Inspect lines and spans for heading candidates and matter detection
                for b in blocks:
                    for l in b.get("lines", []):
                        spans = l.get("spans", [])
                        non_empty_spans = [s for s in spans if s.get("text", "").strip()]
                        n_valid = len(non_empty_spans)

                        for idx, span in enumerate(non_empty_spans):
                            text = span.get("text", "").strip()
                            font_size = float(span.get("size", 0.0))

                            # Detect front-matter markers
                            if fm_pattern.search(text):
                                front_matter_pages.add(page_num)

                            # Detect back-matter markers
                            if bm_pattern.search(text):
                                back_matter_pages.add(page_num)

                            # Heading candidate rules:
                            # 1. font_size >= page_median * 1.4
                            # 2. span text length < 120 chars
                            # 3. span is on its own line (no adjacent same-size spans)
                            if font_size < page_median * 1.4:
                                continue
                            if len(text) >= 120 or len(text) == 0:
                                continue

                            # Check adjacent spans on the same line
                            has_adjacent_same_size = False
                            if idx > 0:
                                prev_size = float(non_empty_spans[idx - 1].get("size", 0.0))
                                if abs(prev_size - font_size) < 0.5:
                                    has_adjacent_same_size = True
                            if idx < n_valid - 1:
                                next_size = float(non_empty_spans[idx + 1].get("size", 0.0))
                                if abs(next_size - font_size) < 0.5:
                                    has_adjacent_same_size = True

                            if has_adjacent_same_size:
                                continue

                            # Determine if this span is considered a body heading
                            is_copyright = bool(copyright_pattern.search(text))
                            has_numbering = bool(numbered_prefix_pattern.search(text))
                            is_fm_marker = bool(fm_pattern.search(text))
                            is_bm_marker = bool(bm_pattern.search(text))

                            if is_copyright:
                                is_heading = False
                            elif has_numbering:
                                is_heading = True
                            elif is_fm_marker or is_bm_marker:
                                is_heading = False
                            else:
                                is_heading = True

                            heading_candidates.append({
                                "page": page_num,
                                "text": text,
                                "font_size": round(font_size, 2),
                                "is_heading": is_heading,
                            })
            except Exception as page_err:
                warnings.append(f"page_{page_num}_error: {str(page_err)}")
                continue

        # Heading candidates limited to top 200 by font_size descending
        heading_candidates.sort(key=lambda c: c["font_size"], reverse=True)
        heading_candidates = heading_candidates[:200]

        # Front-matter page range: candidates strictly preceding body content
        front_matter_page_range: Optional[List[int]] = None
        valid_fm_pages = [p for p in front_matter_pages if (first_body_page is None or p < first_body_page)]
        if valid_fm_pages:
            min_fm = min(valid_fm_pages)
            max_fm = max(valid_fm_pages)
            if first_body_page and first_body_page > 1 and max_fm < (first_body_page - 1):
                max_fm = first_body_page - 1
            if min_fm <= max_fm:
                front_matter_page_range = [min_fm, max_fm]
        elif first_body_page and first_body_page > 1:
            front_matter_page_range = [1, first_body_page - 1]

        # Back-matter page range: candidates following the main body content
        back_matter_page_range: Optional[List[int]] = None
        bm_threshold = first_body_page if first_body_page else (total_pages // 2)
        valid_bm_pages = [p for p in back_matter_pages if p > bm_threshold]
        if valid_bm_pages:
            min_bm = min(valid_bm_pages)
            back_matter_page_range = [min_bm, total_pages]

        # Method determination
        if has_embedded_toc:
            method = "toc"
        elif heading_candidates:
            method = "heuristic"
        else:
            method = "none"

        # Estimated chapter count
        if method == "toc":
            lvl1 = [e for e in toc_entries if e.get("level", 1) == 1]
            estimated_chapter_count = len(lvl1) if len(lvl1) >= 2 else len(toc_entries)
        elif method == "heuristic":
            estimated_chapter_count = sum(1 for c in heading_candidates if c.get("is_heading", True))
        else:
            estimated_chapter_count = 0

        return {
            "has_embedded_toc": has_embedded_toc,
            "toc": toc_entries,
            "heading_candidates": heading_candidates,
            "front_matter_page_range": front_matter_page_range,
            "back_matter_page_range": back_matter_page_range,
            "estimated_chapter_count": estimated_chapter_count,
            "method": method,
            "warnings": warnings,
        }
    except Exception as e:
        warnings.append(f"detect_structure_exception: {str(e)}")
        return {
            "has_embedded_toc": False,
            "toc": [],
            "heading_candidates": [],
            "front_matter_page_range": None,
            "back_matter_page_range": None,
            "estimated_chapter_count": 0,
            "method": "none",
            "warnings": warnings,
        }
    finally:
        if doc is not None:
            try:
                doc.close()
            except Exception:
                pass

