"""Bounded FFmpeg-based video frame extraction with timestamp preservation."""

import math
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

MAX_FRAMES = 100
MAX_FRAME_BYTES = 10 * 1024 * 1024
MAX_FRAME_WIDTH = 1280
DEFAULT_TIMEOUT_SECONDS = 30.0


class VideoFrameExtractionError(Exception):
    """Controlled failure while extracting video frames."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


@dataclass(frozen=True, slots=True)
class ExtractedFrame:
    """A JPEG frame linked to its timestamp in the original video."""

    frame_id: str
    timestamp_seconds: float
    image_bytes: bytes
    content_type: str = "image/jpeg"


def extract_video_frames(
    video_path: Path,
    timestamps_seconds: list[float],
    video_duration_seconds: float,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> list[ExtractedFrame]:
    """Extract requested timestamps into temporary files and return JPEG bytes.

    The caller must authorize access to the evidence and verify its integrity
    before calling this function. The function does not persist extracted
    frames after returning.
    """
    if not math.isfinite(video_duration_seconds) or video_duration_seconds < 0:
        raise VideoFrameExtractionError(
            "invalid_duration", "Video duration must be finite and non-negative."
        )

    if (
        not math.isfinite(timeout_seconds)
        or timeout_seconds <= 0
        or timeout_seconds > 300
    ):
        raise VideoFrameExtractionError(
            "invalid_timeout", "Timeout must be greater than 0 and at most 300 seconds."
        )

    if len(timestamps_seconds) > MAX_FRAMES:
        raise VideoFrameExtractionError(
            "too_many_frames", f"At most {MAX_FRAMES} frames may be extracted."
        )

    if timestamps_seconds != sorted(set(timestamps_seconds)):
        raise VideoFrameExtractionError(
            "invalid_timestamps", "Timestamps must be unique and ascending."
        )

    for timestamp in timestamps_seconds:
        if (
            isinstance(timestamp, bool)
            or not isinstance(timestamp, (int, float))
            or not math.isfinite(timestamp)
            or timestamp < 0
            or timestamp > video_duration_seconds
        ):
            raise VideoFrameExtractionError(
                "invalid_timestamps",
                "Each timestamp must be finite and within the video duration.",
            )

    if not timestamps_seconds:
        return []

    path = Path(video_path)
    if not path.is_file():
        raise VideoFrameExtractionError(
            "video_not_found", "The source video file is unavailable."
        )

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise VideoFrameExtractionError(
            "ffmpeg_unavailable", "Video frame extraction is unavailable."
        )

    frames: list[ExtractedFrame] = []

    try:
        with tempfile.TemporaryDirectory(prefix="proofline-frames-") as temp_dir:
            output_dir = Path(temp_dir)

            for index, timestamp in enumerate(timestamps_seconds, start=1):
                output_path = output_dir / f"frame-{index:04d}.jpg"

                command = [
                    ffmpeg,
                    "-hide_banner",
                    "-loglevel", "error",
                    "-nostdin",
                    "-y",
                    "-i", str(path),
                    "-ss", f"{timestamp:.6f}",
                    "-map", "0:v:0",
                    "-frames:v", "1",
                    "-vf", f"scale=w='min({MAX_FRAME_WIDTH},iw)':h=-2",
                    "-q:v", "3",
                    str(output_path),
                ]

                try:
                    result = subprocess.run(
                        command,
                        capture_output=True,
                        timeout=timeout_seconds,
                        check=False,
                    )
                except subprocess.TimeoutExpired:
                    raise VideoFrameExtractionError(
                        "extraction_timeout", "Video frame extraction timed out."
                    ) from None
                except OSError:
                    raise VideoFrameExtractionError(
                        "extraction_failed", "Could not run the video decoder."
                    ) from None

                if result.returncode != 0 or not output_path.is_file():
                    raise VideoFrameExtractionError(
                        "extraction_failed",
                        f"Could not extract frame at {timestamp:.3f} seconds.",
                    )

                if output_path.stat().st_size > MAX_FRAME_BYTES:
                    raise VideoFrameExtractionError(
                        "frame_too_large", "An extracted frame exceeded the size limit."
                    )

                image_bytes = output_path.read_bytes()
                if not image_bytes.startswith(b"\xff\xd8\xff"):
                    raise VideoFrameExtractionError(
                        "invalid_frame", "The decoder did not produce a valid JPEG frame."
                    )

                frames.append(
                    ExtractedFrame(
                        frame_id=f"frame-{index:04d}",
                        timestamp_seconds=float(timestamp),
                        image_bytes=image_bytes,
                    )
                )

    except VideoFrameExtractionError:
        raise
    except OSError:
        raise VideoFrameExtractionError(
            "extraction_failed", "Could not read the extracted frame."
        ) from None

    return frames
