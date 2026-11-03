"""Built-in sample AI responses for demos and tests (MODEL_MOCK=true).

No network and no API key are needed. The answers are fixed samples that
follow the same JSON shapes as the real provider, so the whole product flow
(analysis, verification, review) can be shown without the live models.
Every mock result says so in its text.
"""

import json
import re

import httpx

_MANIFEST = re.compile(r"Their IDs and timestamps are:\s*(\[.*?\])\s*\n", re.S)


def _video_analysis(payload: dict) -> dict:
    prompt = ""
    for message in payload.get("input", []):
        for part in message.get("content", []):
            if part.get("type") == "input_text":
                prompt = part.get("text", "")
                break
    match = _MANIFEST.search(prompt)
    frames = json.loads(match.group(1)) if match else []

    picks = []
    if frames:
        picks = sorted({0, len(frames) // 2, len(frames) - 1})
    observations = [
        {
            "observation_id": f"obs-{n + 1:03d}",
            "timestamp_seconds": frames[i]["timestamp_seconds"],
            "observation": "Mock analysis: the requested work area is visible in this frame.",
            "relevance": "relevant",
            "supporting_frame_ids": [frames[i]["frame_id"]],
            "limitations": ["Sample answer from mock mode, not a real model result."],
        }
        for n, i in enumerate(picks)
    ]
    return {"confidence": 0.88, "flags": [], "observations": observations}


_FRAME_LIST = re.compile(r"FRAME LIST:\s*(\[.*?\])\s*\n", re.S)


def _comparison(text: str) -> str:
    """Sample answer for the Before/After comparison.

    Put [mock:weak] or [mock:invalid] in the checklist item's instructions to
    see a weak score or an unusable answer.
    """
    if "[mock:invalid]" in text:
        return "Sorry, I cannot answer that."
    match = _FRAME_LIST.search(text)
    frames = json.loads(match.group(1)) if match else []
    weak = "[mock:weak]" in text
    observations = []
    for phase in ("before", "after"):
        mine = [f for f in frames if f.get("phase") == phase]
        for index in sorted({0, len(mine) - 1}) if mine else []:
            observations.append(
                {
                    "phase": phase,
                    "frame_id": mine[index]["frame_id"],
                    "observation": f"Mock analysis: the {phase} frame shows the requested part (sample answer).",
                }
            )
    return json.dumps(
        {
            "same_scene": True,
            "work_visible_after": not weak,
            "change_summary": (
                "Mock analysis: the After file does not clearly show the finished work."
                if weak
                else "Mock analysis: the part looks different in the After file. Sample answer, not a real model result."
            ),
            "target_part": "the part named in the checklist item",
            "confidence": 0.30 if weak else 0.91,
            "flags": ["unclear_evidence"] if weak else [],
            "retake_request": (
                "Mock: record the After file again, closer to the part." if weak else None
            ),
            "observations": observations,
        }
    )


def _segmentation() -> str:
    return "<0f>1,<|box;x1=250;y1=250;x2=749;y2=749;w=1000;h=1000;c=0.90|>"


def _handler(request: httpx.Request) -> httpx.Response:
    path = request.url.path

    if path.endswith("/asr/transcribe"):
        return httpx.Response(
            200,
            json={
                "transcript": "Mock transcript: I checked the valve and closed it.",
                "turns": [],
            },
        )

    if path.endswith("/responses"):
        payload = json.loads(request.content or b"{}")
        text = ""
        for message in payload.get("input", []):
            for part in message.get("content", []):
                if part.get("type") == "input_text":
                    text = part.get("text", "")
                    break
        if "BEFORE_AFTER_COMPARISON" in text:
            return httpx.Response(
                200, json={"output_text": _comparison(text)}
            )
        if "frame_id" in text:
            return httpx.Response(
                200, json={"output_text": json.dumps(_video_analysis(payload))}
            )
        return httpx.Response(200, json={"output_text": _segmentation()})

    return httpx.Response(404, json={"error": "unknown mock endpoint"})


def mock_transport() -> httpx.MockTransport:
    return httpx.MockTransport(_handler)
