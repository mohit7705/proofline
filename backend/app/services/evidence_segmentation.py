"""Object segmentation through Meta SAM 3.1.

Returned masks are evidence regions for reviewer assistance, not fraud verdicts.
"""
import base64
import re
from typing import Any

from app.ai.client import (
    MetaAIClient,
    MetaAIHTTPError,
    MetaAIRequestError,
    MetaAIResponseError,
)

MODEL = "sam-3.1"
SUPPORTED_TYPES = {"image/jpeg", "image/png", "image/webp"}
BOX_PATTERN = re.compile(r"<\|box;([^|]+)\|>")
MASK_PATTERN = re.compile(r"<\|mask;([^|]+)\|>")


def _parse_geometry(text: str) -> dict[str, Any]:
    """Parse available boxes and masks without discarding box-only results."""
    import math

    box_token = re.compile(r"<\|box;([^|]+)\|>")
    mask_token = re.compile(r"<\|mask;([^|]+)\|>")

    def fields(raw: str) -> dict[str, str]:
        result = {}
        for item in raw.split(";"):
            if "=" in item:
                key, value = item.split("=", 1)
                result[key.strip()] = value.strip()
        return result

    records = []
    for line in text.splitlines():
        frame_match = re.match(r"^\s*<(\d+)f(?:;[^>]*)?>(.*)$", line)
        frame_index = int(frame_match.group(1)) if frame_match else 0
        body = frame_match.group(2) if frame_match else line

        chunks = re.split(r"(?=<\|box;)", body)
        object_id = None

        for chunk in chunks:
            box_match = box_token.search(chunk)
            if not box_match:
                continue

            prefix = chunk[:box_match.start()].strip().lstrip(",").strip()
            if prefix.isdigit():
                object_id = prefix

            box = fields(box_match.group(1))
            mask_match = mask_token.search(chunk, box_match.end())
            mask = fields(mask_match.group(1)) if mask_match else {}

            try:
                x1, y1 = int(box["x1"]), int(box["y1"])
                x2, y2 = int(box["x2"]), int(box["y2"])
                width, height = int(box["w"]), int(box["h"])
            except (KeyError, ValueError):
                continue

            if (
                width <= 0 or height <= 0
                or not (0 <= x1 <= x2 < width)
                or not (0 <= y1 <= y2 < height)
            ):
                continue

            confidence = box.get("c")
            try:
                confidence = float(confidence) if confidence is not None else None
            except ValueError:
                confidence = None
            if confidence is not None and (
                not math.isfinite(confidence) or not 0 <= confidence <= 1
            ):
                confidence = None

            mask_data = mask.get("data")
            mask_width = mask_height = None
            if mask_data:
                parts = mask_data.split(",", 2)
                if len(parts) == 3:
                    try:
                        mask_height, mask_width = int(parts[0]), int(parts[1])
                    except ValueError:
                        mask_width = mask_height = None
                    if mask_width is not None and (
                        mask_width <= 0 or mask_height <= 0
                    ):
                        mask_width = mask_height = None

            records.append({
                "frame_index": frame_index,
                "object_id": object_id,
                "box": {
                    "x1": x1, "y1": y1,
                    "x2": x2 + 1, "y2": y2 + 1,
                    "width": width, "height": height,
                },
                "mask": (
                    {
                        "width": mask_width,
                        "height": mask_height,
                        "encoding": (
                            "one_bit" if mask_data.startswith("!") else
                            "lossless" if mask_data.startswith("~") else
                            "unknown"
                        ),
                        "encoded_data": mask_data,
                    }
                    if mask_data else None
                ),
                "confidence": confidence,
            })

    return {
        "boxes": [
            {
                "x1": r["box"]["x1"],
                "y1": r["box"]["y1"],
                "x2": r["box"]["x2"] - 1,
                "y2": r["box"]["y2"] - 1,
                "w": r["box"]["width"],
                "h": r["box"]["height"],
            }
            for r in records
        ],
        "encoded_masks": [
            r["mask"]["encoded_data"]
            for r in records if r["mask"] is not None
        ],
        "mask_count": sum(r["mask"] is not None for r in records),
        "segments": records,
    }


async def segment_image(
    image_bytes: bytes,
    *,
    content_type: str,
    prompt: str,
    client: MetaAIClient | None = None,
) -> dict[str, Any]:
    """Find objects matching a concrete noun phrase in an evidence image."""
    if not isinstance(image_bytes, bytes) or not image_bytes:
        raise ValueError("Image content is empty.")
    if content_type not in SUPPORTED_TYPES:
        raise ValueError("Unsupported image content type.")
    if (
        not isinstance(prompt, str)
        or not prompt.strip()
        or len(prompt) > 200
    ):
        raise ValueError("Provide a short object description.")

    owns_client = client is None
    active = client or MetaAIClient()

    payload = {
        "model": MODEL,
        "input": [{
            "type": "message",
            "role": "user",
            "content": [
                {"type": "input_text", "text": prompt.strip()},
                {
                    "type": "input_image",
                    "image_url": (
                        f"data:{content_type};base64,"
                        f"{base64.b64encode(image_bytes).decode('ascii')}"
                    ),
                },
            ],
        }],
    }

    try:
        response = await active.post_json("/v1/responses", payload)
        text = active.extract_text(response)
        geometry = _parse_geometry(text)

        if not text.strip():
            raise MetaAIResponseError("Segmentation returned no output.")

        return {
            "model": MODEL,
            "prompt": prompt.strip(),
            **geometry,
            "raw_output": text,
            "interpretation": (
                "Segmentation is a visual aid. Empty matches or masks do not "
                "establish whether the submitted evidence is genuine."
            ),
        }
    finally:
        if owns_client:
            await active.aclose()
