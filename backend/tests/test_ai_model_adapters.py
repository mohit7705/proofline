import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from pydantic import SecretStr

from app.ai.client import MetaAIHTTPError, MetaAIResponseError
from app.services import speech_transcription as speech
from app.services import evidence_segmentation as segmentation


def test_segmentation_extracts_box_and_mask():
    output = (
        "<|box;x1=10;y1=20;x2=50;y2=60;w=100;h=100|>"
        "<|mask;x=0;y=0;data=example|>"
    )

    result = segmentation._parse_geometry(output)

    assert len(result["boxes"]) == 1
    assert result["boxes"][0]["x1"] == 10
    assert result["mask_count"] == 1


def test_segmentation_rejects_invalid_box():
    result = segmentation._parse_geometry(
        "<|box;x1=90;y1=20;x2=50;y2=60;w=100;h=100|>"
    )
    assert result["boxes"] == []


class FakeMetaClient:
    def __init__(self, text=None, error=None):
        self.text = text
        self.error = error
        self.closed = False
        self.payload = None

    async def post_json(self, endpoint, payload):
        self.payload = payload
        if self.error:
            raise self.error
        return {"output_text": self.text}

    def extract_text(self, response):
        return response["output_text"]

    async def aclose(self):
        self.closed = True


def test_segmentation_returns_structured_results():
    client = FakeMetaClient(
        text="<|box;x1=1;y1=2;x2=30;y2=40;w=100;h=100|>"
    )

    result = asyncio.run(
        segmentation.segment_image(
            b"fake-image",
            content_type="image/jpeg",
            prompt="a toolbox",
            client=client,
        )
    )

    assert result["model"] == "sam-3.1"
    assert len(result["boxes"]) == 1
    assert result["mask_count"] == 0
    assert client.payload["model"] == "sam-3.1"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"image_bytes": b"", "content_type": "image/jpeg", "prompt": "box"},
        {"image_bytes": b"image", "content_type": "text/plain", "prompt": "box"},
        {"image_bytes": b"image", "content_type": "image/jpeg", "prompt": " "},
    ],
)
def test_segmentation_rejects_invalid_inputs(kwargs):
    with pytest.raises(ValueError):
        asyncio.run(segmentation.segment_image(**kwargs))


def test_segmentation_provider_http_error_propagates():
    client = FakeMetaClient(error=MetaAIHTTPError(503))

    with pytest.raises(MetaAIHTTPError):
        asyncio.run(
            segmentation.segment_image(
                b"image",
                content_type="image/png",
                prompt="a package",
                client=client,
            )
        )


def test_speech_transcription_success(tmp_path, monkeypatch):
    audio = tmp_path / "worker.wav"
    audio.write_bytes(
        (Path(__file__).parent / "fixtures" / "transcription-test-16k.wav").read_bytes()
    )

    monkeypatch.setattr(
        speech,
        "get_settings",
        lambda: SimpleNamespace(
            model_api_key=SecretStr("test-key"),
            meta_api_base_url="https://test.local",
            meta_api_timeout_seconds=5,
        ),
    )

    def handler(request):
        assert request.url.path == "/v1/asr/transcribe"
        return httpx.Response(
            200,
            json={
                "transcript": "I replaced the filter.",
                "turns": [
                    {
                        "transcript": "I replaced the filter.",
                        "start": 0.0,
                        "end": 2.0,
                    }
                ],
            },
        )

    async def run():
        async with httpx.AsyncClient(
            base_url="https://test.local",
            transport=httpx.MockTransport(handler),
        ) as client:
            return await speech.transcribe_audio_file(
                audio, client=client
            )

    result = asyncio.run(run())

    assert result["model"] == "muse-voice-transcribe-1.0"
    assert result["transcript"] == "I replaced the filter."
    assert result["turns"][0]["start"] == 0.0
    assert "not proof" in result["interpretation"]


def test_speech_rejects_missing_file(tmp_path):
    with pytest.raises(ValueError, match="does not exist"):
        asyncio.run(
            speech.transcribe_audio_file(tmp_path / "missing.wav")
        )


def test_speech_rejects_unsupported_file_type(tmp_path):
    audio = tmp_path / "worker.txt"
    audio.write_bytes(b"audio")

    with pytest.raises(ValueError, match="WAV"):
        asyncio.run(speech.transcribe_audio_file(audio))


def test_speech_rejects_empty_audio(tmp_path):
    audio = tmp_path / "empty.wav"
    audio.write_bytes(b"")

    with pytest.raises(ValueError, match="empty"):
        asyncio.run(speech.transcribe_audio_file(audio))


def test_speech_rejects_invalid_mode(tmp_path):
    audio = tmp_path / "worker.wav"
    audio.write_bytes(b"audio")

    with pytest.raises(ValueError, match="mode"):
        asyncio.run(
            speech.transcribe_audio_file(audio, mode="INVALID")
        )
