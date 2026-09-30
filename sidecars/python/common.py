"""
Common utilities and system initialization for the Python sidecar.
"""
import sys

def setup_system_io():
    """
    Reconfigures sys.stdout and sys.stderr to UTF-8 encoding.
    This is required on Windows so that Chinese, multi-language,
    and Unicode text log cleanly to stdout/stderr without UnicodeEncodeError.
    """
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
