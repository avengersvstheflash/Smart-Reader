"""
sidecars/python/nlp/sanitize.py

Surrogate pair and lone surrogate sanitizer.
PyMuPDF/pdfminer sometimes extracts math alphanumerics or corrupted glyphs as
lone UTF-16 surrogates (e.g. U+D835). Python's UTF-8 encoder refuses lone surrogates.
This module replaces unpaired surrogates with U+FFFD while preserving valid pairs.
"""

def sanitize_surrogates(s: str) -> str:
    """Replace lone surrogates with U+FFFD; preserve valid pairs."""
    if not s or not isinstance(s, str):
        return s
    try:
        s.encode('utf-8')
        return s
    except UnicodeEncodeError:
        # Recombine valid pairs, replace unpaired surrogates.
        try:
            return s.encode('utf-16', 'surrogatepass').decode('utf-16', 'replace')
        except (UnicodeError, LookupError):
            return s.encode('utf-8', 'replace').decode('utf-8')

def sanitize_deep(obj):
    """Recursively sanitize strings inside dicts/lists/tuples."""
    if isinstance(obj, str):
        return sanitize_surrogates(obj)
    if isinstance(obj, dict):
        return {
            (sanitize_surrogates(k) if isinstance(k, str) else k): sanitize_deep(v)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [sanitize_deep(x) for x in obj]
    if isinstance(obj, tuple):
        return tuple(sanitize_deep(x) for x in obj)
    return obj

