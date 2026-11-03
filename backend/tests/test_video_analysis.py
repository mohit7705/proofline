import asyncio
import base64
import json
from dataclasses import replace
from uuid import uuid4

import pytest

from app.ai.client import MetaAIHTTPError, MetaAIRequestError
from app.schemas.video_analysis import VideoAnalysisRequest
from app.services.video_analysis import (
    VIDEO_ANALYSIS_ENDPOINT,
    VIDEO_ANALYSIS_MODEL,
    analyze_video_frames,
)
from app.services.video_frames import ExtractedFrame


@pytest.fixture
def analysis_inputs():
    request = VideoAnalysisRequest(
        evidence_id=uuid4(),
        task_id=uuid4(),
        task_instructions="Inspect the completed installation.",
        requirement_instructions="Check that the fixture is visible.",
        required_viewpoints=["front view"],
    )
    frames = [
        ExtractedFrame("frame-0001", 1.0, b"\xff\xd8\xffframe1"),
        ExtractedFrame("frame-0002", 3.0, b"\xff\xd8\xffframe2"),
    ]
    return request, frames


def model_output(frame_id="frame-0001", timestamp=1.0):
    return json.dumps(
        {
            "observations": [
                {
                    "observation_id": "obs-001",
                    "timestamp_seconds": timestamp,
                    "observation": "The fixture is visible in the sampled frame.",
                    "relevance": "relevant",
                    "supporting_frame_ids": [frame_id],
                    "limitations": ["Only sampled frames were examined."],
                }
            ]
        }
    )


class FakeClient:
    def __init__(self, text=None, error=None):
        self.text = text if text is not None else model_output()
        self.error = error
        self.payloads = []

    async def post_json(self, path, payload):
        assert path == VIDEO_ANALYSIS_ENDPOINT
        self.payloads.append(payload)
        if self.error:
            raise self.error
        return {"output_text": self.text}

    @staticmethod
    def extract_text(response):
        return response["output_text"]


def test_valid_response_is_structured_and_traceable(analysis_inputs):
    request, frames = analysis_inputs
    client = FakeClient()

    result = asyncio.run(
        analyze_video_frames(request, frames, 5.0, client=client)
    )

    assert result.status == "completed"
    assert result.observations[0].supporting_frame_ids == ["frame-0001"]
    assert result.observations[0].timestamp_seconds == 1.0
    assert result.coverage.sampled_timestamps_seconds == [1.0, 3.0]
    assert result.coverage.sampling_strategy == "manual"


def test_payload_contains_images_and_model_name(analysis_inputs):
    request, frames = analysis_inputs
    client = FakeClient()

    asyncio.run(
        analyze_video_frames(request, frames, 5.0, client=client)
    )

    payload = client.payloads[0]
    assert payload["model"] == VIDEO_ANALYSIS_MODEL
    content = payload["input"][0]["content"]
    assert content[0]["type"] == "input_text"
    assert content[1]["type"] == "input_image"
    assert content[1]["image_url"].endswith(
        base64.b64encode(frames[0].image_bytes).decode("ascii")
    )


@pytest.mark.parametrize(
    ("text", "expected_code"),
    [
        ("not JSON", "invalid_model_response"),
        ('{"observations": [], "extra": true}', "invalid_model_response"),
        (json.dumps({"observations": "wrong type"}), "invalid_model_response"),
        (model_output("unknown-frame"), "invalid_model_response"),
        (model_output(timestamp=2.0), "invalid_model_response"),
    ],
)
def test_invalid_model_output_is_rejected(
    analysis_inputs, text, expected_code
):
    request, frames = analysis_inputs
    result = asyncio.run(
        analyze_video_frames(
            request, frames, 5.0, client=FakeClient(text=text)
        )
    )

    assert result.status == "failed"
    assert result.error_code == expected_code
    assert result.observations == []


def test_model_timeout_is_controlled(analysis_inputs):
    request, frames = analysis_inputs
    client = FakeClient(error=MetaAIRequestError("timeout"))

    result = asyncio.run(
        analyze_video_frames(request, frames, 5.0, client=client)
    )

    assert result.status == "failed"
    assert result.error_code == "model_timeout"


def test_http_error_is_controlled(analysis_inputs):
    request, frames = analysis_inputs
    client = FakeClient(error=MetaAIHTTPError(503))

    result = asyncio.run(
        analyze_video_frames(request, frames, 5.0, client=client)
    )

    assert result.status == "failed"
    assert result.error_code == "analysis_failed"


def test_empty_frames_are_rejected_without_calling_model(analysis_inputs):
    request, _ = analysis_inputs
    client = FakeClient()

    result = asyncio.run(
        analyze_video_frames(request, [], 5.0, client=client)
    )

    assert result.status == "failed"
    assert result.error_code == "analysis_failed"
    assert client.payloads == []


def test_duplicate_frame_ids_are_rejected(analysis_inputs):
    request, frames = analysis_inputs
    duplicate_frames = [
        frames[0],
        ExtractedFrame("frame-0001", 3.0, b"\xff\xd8\xffother"),
    ]
    client = FakeClient()

    result = asyncio.run(
        analyze_video_frames(
            request, duplicate_frames, 5.0, client=client
        )
    )

    assert result.status == "failed"
    assert result.error_code == "analysis_failed"
    assert client.payloads == []


def test_unexpected_provider_error_does_not_return_success(analysis_inputs):
    request, frames = analysis_inputs
    client = FakeClient(error=RuntimeError("unexpected provider failure"))

    with pytest.raises(RuntimeError, match="unexpected provider failure"):
        asyncio.run(
            analyze_video_frames(request, frames, 5.0, client=client)
        )


@pytest.mark.parametrize(
    "output",
    [
        {
            "confidence": 1.5,
            "observations": [],
        },
        {
            "confidence": -0.1,
            "observations": [],
        },
        {
            "confidence": 0.5,
            "observations": [
                {
                    "observation_id": "obs-001",
                    "timestamp_seconds": 1.0,
                    "observation": "A fixture is visible.",
                    "relevance": "relevant",
                    "supporting_frame_ids": ["frame-0001"],
                    "limitations": [],
                    "unexpected_field": "must be rejected",
                }
            ],
        },
    ],
)
def test_invalid_confidence_or_observation_is_rejected(
    analysis_inputs, output
):
    request, frames = analysis_inputs
    result = asyncio.run(
        analyze_video_frames(
            request,
            frames,
            5.0,
            client=FakeClient(text=json.dumps(output)),
        )
    )

    assert result.status == "failed"
    assert result.error_code == "invalid_model_response"
    assert result.observations == []


@pytest.mark.parametrize(
    "duration",
    [float("nan"), float("inf"), float("-inf")],
)
def test_rejects_non_finite_video_duration(analysis_inputs, duration):
    request, frames = analysis_inputs
    result = asyncio.run(
        analyze_video_frames(request, frames, duration, client=FakeClient())
    )

    assert result.status == "failed"
    assert result.error_code == "analysis_failed"


def test_rejects_unsupported_frame_content_type(analysis_inputs):
    request, frames = analysis_inputs
    frames[0] = replace(frames[0], content_type="text/html")

    result = asyncio.run(
        analyze_video_frames(request, frames, 5.0, client=FakeClient())
    )

    assert result.status == "failed"
    assert result.error_code == "analysis_failed"
