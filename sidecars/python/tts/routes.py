"""
sidecars/python/tts/routes.py

FastAPI routes for Kokoro TTS synthesis and status.
"""

import os
from typing import Optional
from fastapi import APIRouter, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from lifecycle import lifecycle_manager
from .synthesize import (
    synthesize_sentence,
    estimate_duration_ms,
    is_model_installed,
    VOICE_WHITELIST,
    ModelNotInstalledError,
    UnsupportedLanguageError,
    InputTooLongError,
)

router = APIRouter(prefix="", tags=["tts"])


class SynthesizeRequest(BaseModel):
    text: str
    voice: Optional[str] = "af_heart"
    speed: Optional[float] = 1.0
    format: Optional[str] = "wav"


@router.post("/v1/tts/synthesize")
def synthesize_endpoint(payload: SynthesizeRequest):
    """
    Synthesizes a sentence to 24kHz 16-bit mono WAV audio.
    Acquires 'tts' model lock through LifecycleManager.
    """
    try:
        with lifecycle_manager.acquire("tts"):
            wav_bytes = synthesize_sentence(
                text=payload.text,
                voice=payload.voice or "af_heart",
                speed=payload.speed or 1.0,
            )

        voice_name = payload.voice if (payload.voice and payload.voice in VOICE_WHITELIST) else "af_heart"
        duration_ms = estimate_duration_ms(wav_bytes)

        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "X-TTS-Voice": voice_name,
                "X-TTS-Sample-Rate": "24000",
                "X-TTS-Duration-Ms": str(duration_ms),
                "X-TTS-Character-Count": str(len(payload.text)),
            },
        )
    except ModelNotInstalledError as e:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "status": "error",
                "code": "MODEL_NOT_INSTALLED",
                "message": str(e),
                "model": "tts",
            },
        )
    except UnsupportedLanguageError as e:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "status": "error",
                "code": "UNSUPPORTED_LANGUAGE",
                "message": str(e),
                "model": "tts",
            },
        )
    except InputTooLongError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "status": "error",
                "code": "INPUT_TOO_LONG",
                "message": str(e),
                "model": "tts",
            },
        )
    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "status": "error",
                "code": "INVALID_INPUT",
                "message": str(e),
                "model": "tts",
            },
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "code": "SYNTHESIS_FAILED",
                "message": str(e),
                "model": "tts",
            },
        )


@router.get("/v1/tts/status")
def status_endpoint():
    """
    Returns the current readiness and lifecycle state of the TTS engine.
    """
    state = lifecycle_manager.get_state("tts") or "UNLOADED"
    installed = is_model_installed()
    return {
        "ready": state == "LOADED",
        "modelState": state,
        "installed": installed,
        "voices": VOICE_WHITELIST,
    }

