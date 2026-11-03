"""Speech transcription through Meta Model API.

Transcripts are worker claims, not proof that a task was completed.
"""
import asyncio
import json
import logging
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import Any

import httpx

from app.core.config import get_settings
from app.ai.client import MetaAIHTTPError, MetaAIRequestError, MetaAIResponseError

MODEL = "muse-voice-transcribe-1.0"
MAX_AUDIO_BYTES = 32 * 1024 * 1024
ALLOWED_SUFFIXES = {
    ".wav",
    ".mp3",
    ".mp4",
    ".m4a",
    ".webm",
    ".ogg",
    ".oga",
    ".opus",
    ".aac",
    ".flac",
    ".mov",
}
log = logging.getLogger("proofline.speech")


class UnsupportedAudioError(ValueError):
    """Raised when an uploaded file cannot be decoded as valid audio."""


def _to_16k_mono(source: Path, target: Path) -> bool:
    """Convert to the format the speech model accepts. False = could not convert."""
    if shutil.which("ffmpeg") is None:
        return False
    try:
        done = subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-nostdin",
                "-y",
                "-i",
                str(source),
                "-vn",
                "-t",
                "300",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                str(target),
            ],
            capture_output=True,
            timeout=60,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return done.returncode == 0 and target.is_file() and target.stat().st_size > 44


async def transcribe_audio_file(
    path: Path,
    *,
    mode: str = "PUSH_TO_TALK",
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Transcribe a WAV recording and return the provider's validated JSON."""
    if mode not in {"PUSH_TO_TALK", "ENDPOINTING", "DIARIZATION"}:
        raise ValueError("Unsupported transcription mode.")

    path = Path(path)
    if not path.is_file():
        raise ValueError("Audio file does not exist.")
    if path.suffix.lower() not in ALLOWED_SUFFIXES:
        raise ValueError("Audio must be WAV, MP3, MP4, M4A, WebM or OGG.")

    size = path.stat().st_size
    if size <= 0 or size > MAX_AUDIO_BYTES:
        raise ValueError("Audio file is empty or exceeds the 32 MB limit.")

    settings = get_settings()
    api_key = settings.model_api_key
    use_mock = client is None and settings.model_mock
    if not api_key and not use_mock and client is None:
        raise RuntimeError("MODEL_API_KEY is not configured.")

    owns_client = client is None
    if use_mock:
        from app.ai.mock import mock_transport

        active = httpx.AsyncClient(
            base_url=settings.meta_api_base_url.rstrip("/"),
            transport=mock_transport(),
        )
    else:
        active = client or httpx.AsyncClient(
            base_url=settings.meta_api_base_url.rstrip("/"),
            headers={
                "Authorization": f"Bearer {api_key.get_secret_value()}",
                "Accept": "application/json",
            },
            timeout=httpx.Timeout(settings.meta_api_timeout_seconds),
        )

    try:
        with tempfile.TemporaryDirectory() as folder:
            converted = Path(folder) / "speech16k.wav"
            ok = await asyncio.to_thread(_to_16k_mono, path, converted)
            if not ok:
                raise UnsupportedAudioError(
                    "This file could not be read as valid audio."
                )
            audio = converted.read_bytes()
        response = await active.post(
            "/v1/asr/transcribe",
            files={
                "request": (
                    None,
                    json.dumps({
                        "model": MODEL,
                        "audioEncoding": "WAV",
                        "mode": mode,
                    }),
                    "application/json",
                ),
                "audio": (path.name, audio, "audio/wav"),
            },
        )
        if not response.is_success:
            log.warning("Speech model HTTP %s: %s", response.status_code, response.text[:300])
            raise MetaAIHTTPError(response.status_code)

        try:
            data = response.json()
        except ValueError as exc:
            raise MetaAIResponseError(
                "Transcription service returned invalid JSON."
            ) from exc

        if not isinstance(data, dict):
            raise MetaAIResponseError(
                "Transcription service returned an invalid response."
            )

        transcript = data.get("transcript")
        turns = data.get("turns", [])

        if not isinstance(turns, list):
            raise MetaAIResponseError("Invalid transcription turns.")

        if transcript is not None and not isinstance(transcript, str):
            raise MetaAIResponseError("Invalid transcript text.")

        if transcript is None:
            transcript = " ".join(
                turn["transcript"]
                for turn in turns
                if isinstance(turn, dict)
                and isinstance(turn.get("transcript"), str)
            )

        if not transcript.strip() and not turns:
            raise MetaAIResponseError("No transcript was returned.")

        return {
            "model": MODEL,
            "transcript": transcript,
            "turns": turns,
            "mode": mode,
            "source_filename": path.name,
            "interpretation": (
                "Worker-reported claims only; not proof of task completion."
            ),
        }

    except httpx.TimeoutException as exc:
        raise MetaAIRequestError("Transcription request timed out.") from exc
    except httpx.RequestError as exc:
        raise MetaAIRequestError("Unable to reach transcription service.") from exc
    finally:
        if owns_client:
            await active.aclose()
