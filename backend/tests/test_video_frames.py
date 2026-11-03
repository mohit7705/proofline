import subprocess

import pytest

from app.services import video_frames
from app.services.video_frames import (
    ExtractedFrame,
    VideoFrameExtractionError,
    extract_video_frames,
)

JPEG_BYTES = b"\xff\xd8\xff" + b"synthetic-test-frame"


@pytest.fixture
def source_video(tmp_path):
    path = tmp_path / "source.mp4"
    path.write_bytes(b"test video placeholder")
    return path


def fake_ffmpeg_success(monkeypatch):
    monkeypatch.setattr(video_frames.shutil, "which", lambda _: "/usr/bin/ffmpeg")

    def fake_run(command, **kwargs):
        output_path = command[-1]
        with open(output_path, "wb") as frame:
            frame.write(JPEG_BYTES)

        return subprocess.CompletedProcess(command, 0, b"", b"")

    monkeypatch.setattr(video_frames.subprocess, "run", fake_run)


def test_extracts_frames_and_preserves_original_timestamps(
    source_video, monkeypatch
):
    fake_ffmpeg_success(monkeypatch)

    frames = extract_video_frames(source_video, [0, 2.5, 5], 10)

    assert len(frames) == 3
    assert [frame.frame_id for frame in frames] == [
        "frame-0001", "frame-0002", "frame-0003"
    ]
    assert [frame.timestamp_seconds for frame in frames] == [0.0, 2.5, 5.0]
    assert all(frame.image_bytes == JPEG_BYTES for frame in frames)
    assert all(frame.content_type == "image/jpeg" for frame in frames)


def test_empty_timestamp_list_returns_no_frames(source_video, monkeypatch):
    frames = extract_video_frames(source_video, [], 10)
    assert frames == []


@pytest.mark.parametrize(
    "timestamps",
    [[2, 1], [1, 1], [-1], [11], [float("nan")], [float("inf")]],
)
def test_rejects_invalid_timestamps(source_video, timestamps):
    with pytest.raises(VideoFrameExtractionError):
        extract_video_frames(source_video, timestamps, 10)


def test_rejects_more_than_maximum_frames(source_video):
    with pytest.raises(VideoFrameExtractionError) as error:
        extract_video_frames(
            source_video, list(range(101)), 200
        )
    assert error.value.code == "too_many_frames"


def test_rejects_invalid_duration(source_video):
    with pytest.raises(VideoFrameExtractionError) as error:
        extract_video_frames(source_video, [0], float("nan"))
    assert error.value.code == "invalid_duration"


def test_rejects_invalid_timeout(source_video):
    with pytest.raises(VideoFrameExtractionError) as error:
        extract_video_frames(source_video, [0], 10, timeout_seconds=0)
    assert error.value.code == "invalid_timeout"


def test_rejects_missing_video(tmp_path):
    with pytest.raises(VideoFrameExtractionError) as error:
        extract_video_frames(tmp_path / "missing.mp4", [0], 10)
    assert error.value.code == "video_not_found"


def test_rejects_missing_ffmpeg(source_video, monkeypatch):
    monkeypatch.setattr(video_frames.shutil, "which", lambda _: None)

    with pytest.raises(VideoFrameExtractionError) as error:
        extract_video_frames(source_video, [0], 10)
    assert error.value.code == "ffmpeg_unavailable"


def test_handles_ffmpeg_timeout(source_video, monkeypatch):
    monkeypatch.setattr(video_frames.shutil, "which", lambda _: "/usr/bin/ffmpeg")

    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired(args[0], kwargs["timeout"])

    monkeypatch.setattr(video_frames.subprocess, "run", timeout)

    with pytest.raises(VideoFrameExtractionError) as error:
        extract_video_frames(source_video, [0], 10)
    assert error.value.code == "extraction_timeout"


def test_handles_ffmpeg_failure(source_video, monkeypatch):
    monkeypatch.setattr(video_frames.shutil, "which", lambda _: "/usr/bin/ffmpeg")

    def failure(command, **kwargs):
        return subprocess.CompletedProcess(command, 1, b"", b"decode error")

    monkeypatch.setattr(video_frames.subprocess, "run", failure)

    with pytest.raises(VideoFrameExtractionError) as error:
        extract_video_frames(source_video, [0], 10)
    assert error.value.code == "extraction_failed"


def test_rejects_non_jpeg_output(source_video, monkeypatch):
    monkeypatch.setattr(video_frames.shutil, "which", lambda _: "/usr/bin/ffmpeg")

    def invalid_output(command, **kwargs):
        with open(command[-1], "wb") as output:
            output.write(b"not a jpeg")
        return subprocess.CompletedProcess(command, 0, b"", b"")

    monkeypatch.setattr(video_frames.subprocess, "run", invalid_output)

    with pytest.raises(VideoFrameExtractionError) as error:
        extract_video_frames(source_video, [0], 10)
    assert error.value.code == "invalid_frame"


def test_rejects_frame_larger_than_limit(source_video, monkeypatch):
    monkeypatch.setattr(video_frames.shutil, "which", lambda _: "/usr/bin/ffmpeg")

    def oversized_output(command, **kwargs):
        with open(command[-1], "wb") as output:
            output.write(b"\xff\xd8\xff" + b"x" * video_frames.MAX_FRAME_BYTES)
        return subprocess.CompletedProcess(command, 0, b"", b"")

    monkeypatch.setattr(video_frames.subprocess, "run", oversized_output)

    with pytest.raises(VideoFrameExtractionError) as error:
        extract_video_frames(source_video, [0], 10)
    assert error.value.code == "frame_too_large"


def test_output_frame_model_is_immutable():
    frame = ExtractedFrame(
        frame_id="frame-0001",
        timestamp_seconds=1.5,
        image_bytes=JPEG_BYTES,
    )
    with pytest.raises(AttributeError):
        frame.timestamp_seconds = 2.0
