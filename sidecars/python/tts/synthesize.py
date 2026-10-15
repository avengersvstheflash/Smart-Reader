"""
sidecars/python/tts/synthesize.py

Synthesis engine for Kokoro-82M TTS.
Provides sentence-level 24kHz 16-bit mono PCM WAV audio generation.
"""

import os
import io
import re
import wave
import unicodedata
import sys
from typing import Optional

MODEL_DIR = os.environ.get(
    'OMNITOME_KOKORO_DIR',
    os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'models', 'kokoro'))
)

VOICE_WHITELIST = ['af_heart', 'am_adam', 'bf_alice', 'bm_george']


class ModelNotInstalledError(Exception):
    """Raised when Kokoro model weights or package are not found."""
    pass


class UnsupportedLanguageError(Exception):
    """Raised when input text contains predominantly non-Latin/non-English scripts."""
    pass


class InputTooLongError(Exception):
    """Raised when input text exceeds 1,000 characters."""
    pass


_engine = None


def get_model_path() -> str:
    return os.path.join(MODEL_DIR, 'kokoro-v0_19.pth')


def is_model_installed() -> bool:
    return os.path.exists(get_model_path())


def load_engine():
    """
    Loads Kokoro pipeline. Uses lazy import so the sidecar can boot
    even if the kokoro package or model weights are absent.
    """
    global _engine
    if _engine is not None:
        return _engine

    model_path = get_model_path()
    if not os.path.exists(model_path):
        raise ModelNotInstalledError(f"Kokoro weights not found at {model_path}")

    try:
        import torch
        from kokoro import KPipeline
    except ImportError as e:
        raise ModelNotInstalledError(f"Kokoro library not installed: {e}")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[TTS] Loading Kokoro pipeline from {model_path} (device={device})...")
    try:
        _engine = KPipeline(lang_code='a', model=model_path, device=device)
        print("[TTS] Kokoro pipeline loaded successfully.")
        return _engine
    except Exception as e:
        print(f"[TTS Error] Failed to load Kokoro pipeline: {e}", file=sys.stderr)
        raise


def unload_engine(model=None):
    """
    Unloads the engine and releases RAM / CUDA VRAM.
    """
    global _engine
    print("[TTS] Unloading Kokoro engine...")
    _engine = None
    del model
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass
    import gc
    gc.collect()


def is_predominantly_non_latin(text: str) -> bool:
    """
    Checks if text is predominantly composed of non-Latin characters.
    Ignores whitespace, common digits, and punctuation.
    """
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return False

    latin_count = sum(
        1 for c in letters
        if ord(c) < 0x250 or 'LATIN' in unicodedata.name(c, '')
    )
    non_latin_count = len(letters) - latin_count
    return non_latin_count > latin_count


def sanitize_text(text: str) -> str:
    """
    Cleans citation tags, collapses whitespace, and NFC normalizes.
    """
    if not text:
        return ""
    # Strip citation brackets e.g. [Source 1], (Sources 1-3)
    cleaned = re.sub(r'\s*\[Source \d+\]', '', text)
    cleaned = re.sub(r'\s*\(Sources? \d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\)', '', cleaned)
    # Normalize unicode to NFC
    cleaned = unicodedata.normalize('NFC', cleaned)
    # Collapse whitespace
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned


def estimate_duration_ms(wav_bytes: bytes) -> int:
    """
    Calculates audio duration in milliseconds from 24kHz 16-bit mono WAV PCM data.
    44-byte standard RIFF header is excluded.
    """
    pcm_bytes = max(0, len(wav_bytes) - 44)
    # 24,000 samples/sec * 2 bytes/sample (16-bit mono) = 48,000 bytes/sec
    return int(round((pcm_bytes / (24000 * 2)) * 1000))


def synthesize_sentence(text: str, voice: str = 'af_heart', speed: float = 1.0) -> bytes:
    """
    Synthesizes a single sentence into 24kHz 16-bit mono WAV bytes.
    """
    if not text or not isinstance(text, str) or not text.strip():
        raise ValueError("Text cannot be empty")

    cleaned = sanitize_text(text)
    if not cleaned:
        raise ValueError("Text cannot be empty after sanitization")

    if len(cleaned) > 1000:
        raise InputTooLongError(
            f"Input text length ({len(cleaned)}) exceeds maximum allowed limit of 1000 characters."
        )

    if is_predominantly_non_latin(cleaned):
        raise UnsupportedLanguageError(
            "Predominantly non-English/non-Latin scripts are not supported in v1.0."
        )

    norm_voice = (voice or 'af_heart').lower().strip()
    if norm_voice not in VOICE_WHITELIST:
        norm_voice = 'af_heart'

    clamped_speed = max(0.5, min(2.0, float(speed if speed is not None else 1.0)))

    # Ensure engine is loaded
    engine = load_engine()

    try:
        import numpy as np
    except ImportError:
        np = None

    # Call Kokoro pipeline
    # Kokoro generator yields tuples: (graphemes, phonemes, audio)
    audio_chunks = []
    for _, _, audio in engine(cleaned, voice=norm_voice, speed=clamped_speed):
        if audio is not None:
            if hasattr(audio, 'numpy'):
                audio = audio.numpy()
            audio_chunks.append(audio)

    if not audio_chunks:
        raise RuntimeError("Kokoro engine produced no audio output.")

    if np is not None:
        full_audio = np.concatenate(audio_chunks)
        # Convert float32 [-1.0, 1.0] to int16 PCM [-32768, 32767]
        pcm_int16 = (full_audio * 32767).clip(-32768, 32767).astype(np.int16)
        raw_pcm_bytes = pcm_int16.tobytes()
    else:
        import array
        raw_pcm_bytes = b"".join(
            array.array('h', [int(max(-1.0, min(1.0, float(x))) * 32767) for x in chunk]).tobytes()
            for chunk in audio_chunks
        )

    # Encode to 24kHz 16-bit mono WAV
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wav_file:
        wav_file.setnchannels(1)      # Mono
        wav_file.setsampwidth(2)      # 16-bit
        wav_file.setframerate(24000)  # 24kHz
        wav_file.writeframes(raw_pcm_bytes)

    return buf.getvalue()

