"""v2 step 2: the AI score (mock AI, no network)."""

import shutil
import uuid

import pytest

from app.core.config import get_settings
from app.core.security import create_access_token
from app.services.score_ai import ScoreAIError, parse_comparison
from app.services.score_parts import (
    code_matches,
    combine,
    item_score,
    make_part,
    part_match,
    rules_check,
    vision_score,
)
from conftest import auth
from test_hardening_and_ai import make_video_file, mock_ai  # noqa: F401 (fixture)
from test_v2_step1 import new_user, upload_phase
from test_verification_engine import make_task, verification


@pytest.fixture(autouse=True)
def background_sessions(setup, monkeypatch):
    """Background jobs use the test database."""
    from app.api import ai_jobs

    monkeypatch.setattr(ai_jobs, "get_session_factory", lambda: setup["session_factory"])


PAIR = {"minimum_evidence_count": 2, "requires_before_after": True}


def box(x1, y1, x2, y2):
    return {"x1": x1, "y1": y1, "x2": x2, "y2": y2, "w": 1000, "h": 1000}


def run_score(setup, task_id, token=None):
    return setup["client"].post(
        f"/tasks/{task_id}/score/run", headers=auth(token or setup["worker_token"])
    )


def photo_pair(setup, requirements=None):
    task_id, ids = make_task(setup, requirements or [PAIR])
    upload_phase(setup, task_id, "before-shot", "before", ids[0])
    upload_phase(setup, task_id, "after-shot", "after", ids[0])
    return task_id, ids


def score_of(setup, task_id, token=None):
    return setup["client"].get(
        f"/tasks/{task_id}/score", headers=auth(token or setup["worker_token"])
    ).json()


# ---------- the arithmetic ----------

def test_code_matching_is_forgiving_about_speech_but_not_about_the_number():
    assert code_matches("the code is falcon 417", "FALCON 417")
    assert code_matches("Falcon four one seven", "FALCON 417")
    assert code_matches("falcon, 4 1 7.", "FALCON 417")
    assert code_matches("falkon 417", "FALCON 417")
    assert not code_matches("falcon 418", "FALCON 417")
    assert not code_matches("I checked the part", "FALCON 417")
    assert not code_matches("", "FALCON 417")


def test_parts_are_reweighted_and_never_count_as_zero_when_missing():
    parts = [make_part("vision", 80, ""), make_part("code", None, ""), make_part("rules", 100, "")]
    assert combine(parts) == round((80 * 50 + 100 * 15) / 65)
    assert combine([make_part("code", None, "")]) is None


def test_item_needing_ai_is_not_scored_without_the_ai_result():
    parts = [make_part("vision", None, ""), make_part("rules", 100, "")]
    score, reasons = item_score(parts, needs_ai=True)
    assert score is None and reasons


def test_rules_only_item_is_never_strong():
    score, reasons = item_score([make_part("rules", 100, "")], needs_ai=False)
    assert score == 75 and reasons


def test_vision_score_is_lowered_when_files_do_not_match():
    answer = {"confidence": 0.95, "same_scene": False, "work_visible_after": True, "flags": [], "change_summary": ""}
    assert vision_score(answer)[0] == 40
    answer.update(same_scene=True, work_visible_after=False)
    assert vision_score(answer)[0] == 45


def test_part_match_cases():
    same = [box(250, 250, 749, 749)]
    assert part_match(same, same)[0] == 100
    assert part_match([box(0, 0, 200, 200)], [box(700, 700, 999, 999)])[0] == 50
    assert part_match([], same)[0] == 35
    assert part_match([], [])[0] == 20
    assert part_match(None, same)[0] is None


def test_rules_check():
    assert rules_check(2, 2, 0, 0, False)[0] == 100
    assert rules_check(2, 2, 1, 1, False)[0] == 35
    assert rules_check(1, 2, 0, 0, False)[0] is None
    assert rules_check(2, 2, 0, 0, True)[0] == 0


def test_model_answer_is_validated():
    ids = {"before-photo", "after-photo"}
    good = (
        '{"same_scene": true, "work_visible_after": true, "change_summary": "Valve closed.", '
        '"target_part": "valve", "confidence": 0.9, "flags": [], "retake_request": null, '
        '"observations": [{"phase": "after", "frame_id": "after-photo", "observation": "Closed."}]}'
    )
    assert parse_comparison(good, ids)["confidence"] == 0.9
    assert parse_comparison("```json\n" + good + "\n```", ids)["target_part"] == "valve"
    for broken in (
        "not json",
        good.replace('"confidence": 0.9', '"confidence": 7'),
        good.replace("after-photo", "invented-frame", 1),
        good.replace('"flags": []', '"flags": [1]'),
        good[:-1] + ', "extra": 1}',
    ):
        with pytest.raises(ScoreAIError):
            parse_comparison(broken, ids)


# ---------- running a score ----------

def test_worker_scores_a_photo_pair_and_everyone_sees_it(setup, mock_ai):  # noqa: F811
    task_id, (req,) = photo_pair(setup)
    started = run_score(setup, task_id)
    assert started.status_code == 202, started.text
    assert started.json()["status"] == "queued"

    job = setup["client"].get(f"/tasks/{task_id}/score/job", headers=auth(setup["worker_token"])).json()
    assert job["status"] == "completed" and job["error_code"] is None

    body = score_of(setup, task_id)
    assert body["scored"] is True and body["task"]["band"] == "strong"
    assert body["model_name"].startswith("mock")
    keys = [p["key"] for p in body["items"][0]["parts"]]
    assert keys == ["vision", "part", "rules"]

    seen = setup["client"].get(f"/tasks/{task_id}/score/analysis", headers=auth(setup["manager_token"])).json()
    assert seen["available"] is True and seen["mock"] is True
    item = seen["items"][0]
    assert item["mode"] == "before_after" and item["status"] == "scored"
    assert item["before"]["filename"] == "before-shot.png"
    assert item["outlines"]["before"]["boxes"] and item["outlines"]["after"]["boxes"]
    assert item["change_summary"]


def test_missing_after_file_is_not_scored_and_says_what_to_add(setup, mock_ai):  # noqa: F811
    task_id, (req,) = make_task(setup, [PAIR])
    upload_phase(setup, task_id, "only-before", "before", req)
    assert run_score(setup, task_id).status_code == 202
    body = score_of(setup, task_id)
    assert body["scored"] is False and body["task"]["band"] == "not_scored"
    assert "Add an After file." in body["items"][0]["reasons"]
    job = setup["client"].get(f"/tasks/{task_id}/score/job", headers=auth(setup["worker_token"])).json()
    assert job["status"] == "failed"


def test_weak_score_gives_a_retake_note_and_sends_the_task_to_a_person(setup, mock_ai):  # noqa: F811
    task_id, _ = photo_pair(setup, [{**PAIR, "instructions": "Show the valve [mock:weak]"}])
    run_score(setup, task_id)
    body = score_of(setup, task_id)
    assert body["task"]["band"] == "weak"
    analysis = setup["client"].get(f"/tasks/{task_id}/score/analysis", headers=auth(setup["worker_token"])).json()
    assert analysis["retake_notes"]
    advice = verification(setup, task_id, method="post")
    assert advice["decision"] == "NEEDS_HUMAN_REVIEW"
    assert any(s["label"] == "Low AI score" for s in advice["integrity_signals"])


def test_unusable_model_answer_leaves_the_item_not_scored(setup, mock_ai):  # noqa: F811
    task_id, _ = photo_pair(setup, [{**PAIR, "instructions": "Show it [mock:invalid]"}])
    run_score(setup, task_id)
    assert score_of(setup, task_id)["scored"] is False
    job = setup["client"].get(f"/tasks/{task_id}/score/job", headers=auth(setup["worker_token"])).json()
    assert job["status"] == "failed" and job["error_code"] == "invalid_model_response"


def test_item_without_before_after_is_scored_on_rules_only(setup, mock_ai):  # noqa: F811
    task_id, (req,) = make_task(setup, [{"minimum_evidence_count": 1}])
    upload_phase(setup, task_id, "solo", None, req)
    run_score(setup, task_id)
    body = score_of(setup, task_id)
    assert body["task"]["score"] == 75
    assert [p["key"] for p in body["items"][0]["parts"]] == ["rules"]


def test_duplicate_before_and_after_lowers_the_score(setup, mock_ai):  # noqa: F811
    task_id, (req,) = make_task(setup, [PAIR])
    upload_phase(setup, task_id, "same", "before", req, name="shot.png")
    upload_phase(setup, task_id, "same", "after", req, name="shot.png")
    run_score(setup, task_id)
    rules = next(p for p in score_of(setup, task_id)["items"][0]["parts"] if p["key"] == "rules")
    assert rules["score"] == 60


# ---------- who may run it ----------

def test_permissions_and_limits(setup, mock_ai, monkeypatch):  # noqa: F811
    task_id, _ = photo_pair(setup)
    other = create_access_token(str(setup["other_worker_id"]))
    assert run_score(setup, task_id, other).status_code == 404
    assert setup["client"].post(f"/tasks/{task_id}/score/run").status_code == 401
    _, reviewer = new_user(setup, "manager", "Ian")
    assert run_score(setup, task_id, reviewer).status_code == 202

    monkeypatch.setenv("WORKER_ANALYSIS_PER_HOUR", "1")
    get_settings.cache_clear()
    limited = run_score(setup, task_id)
    assert limited.status_code == 202  # the reviewer's run is not the worker's
    again = run_score(setup, task_id)
    assert again.status_code == 429 and again.headers["Retry-After"] == "600"


def test_nothing_to_score_yet_and_no_ai_configured(setup, mock_ai, monkeypatch):  # noqa: F811
    task_id, _ = make_task(setup, [PAIR])
    assert run_score(setup, task_id).status_code == 422  # no files yet
    empty, _ = make_task(setup, [])
    assert run_score(setup, empty).status_code == 422  # no checklist

    upload_phase(setup, task_id, "b", "before", None)
    monkeypatch.setenv("MODEL_MOCK", "false")
    monkeypatch.setenv("MODEL_API_KEY", "")
    get_settings.cache_clear()
    assert run_score(setup, task_id).status_code == 503


def test_status_and_analysis_before_any_run(setup):
    task_id, _ = make_task(setup, [PAIR])
    job = setup["client"].get(f"/tasks/{task_id}/score/job", headers=auth(setup["worker_token"])).json()
    assert job["status"] == "none"
    analysis = setup["client"].get(f"/tasks/{task_id}/score/analysis", headers=auth(setup["worker_token"])).json()
    assert analysis["available"] is False and analysis["items"] == []


# ---------- videos and the spoken code (needs ffmpeg) ----------

@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg is needed")
@pytest.mark.parametrize("instructions,expected", [("Show the part", 100), ("Show the part [mock:nocode]", 0)])
def test_video_pair_checks_the_spoken_code(setup, mock_ai, tmp_path, instructions, expected):  # noqa: F811
    task_id, (req,) = make_task(
        setup, [{"response_type": "video", "minimum_evidence_count": 2, "requires_before_after": True, "instructions": instructions}]
    )
    worker = auth(setup["worker_token"])
    client = setup["client"]
    assert client.get(f"/tasks/{task_id}/challenge", headers=worker).status_code == 200
    for phase in ("before", "after"):
        path = tmp_path / f"{phase}.mp4"
        make_video_file(path)
        done = client.post(
            f"/tasks/{task_id}/evidence", headers=worker,
            files={"file": (f"{phase}.mp4", path.read_bytes(), "video/mp4")},
            data={"requirement_id": req, "phase": phase},
        )
        assert done.status_code == 201, done.text

    assert run_score(setup, task_id).status_code == 202
    parts = {p["key"]: p for p in score_of(setup, task_id)["items"][0]["parts"]}
    assert parts["code"]["score"] == expected
    code = client.get(f"/tasks/{task_id}/score/analysis", headers=worker).json()["items"][0]["code"]
    assert code["heard"] is (expected == 100) and code["transcript"]

    # Each video also got a normal analysis, so the existing checks see it.
    listed = client.get(f"/tasks/{task_id}/evidence", headers=worker).json()
    for entry in listed:
        analysis = client.get(f"/evidence/{entry['id']}/analysis", headers=worker)
        assert analysis.status_code == 200 and analysis.json()["status"] == "completed"
    if expected == 0:
        advice = verification(setup, task_id, method="post")
        assert advice["decision"] == "NEEDS_HUMAN_REVIEW"
        assert any(s["label"] == "Challenge code not heard" for s in advice["integrity_signals"])
