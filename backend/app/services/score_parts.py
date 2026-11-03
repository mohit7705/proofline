"""The arithmetic behind an AI score.

No database and no network here, so every rule can be tested on its own.
A score is advice for the reviewer. It never approves or rejects a task.
"""

import difflib
import math
import re
from typing import Any

# How much each named part counts. A part with no score is left out and the
# rest are re-weighted, so a missing part is never silently counted as 100.
WEIGHTS = {"vision": 50, "part": 20, "code": 15, "rules": 15}
LABELS = {
    "vision": "Before/after comparison",
    "part": "Same part in both files",
    "code": "Spoken challenge code",
    "rules": "Evidence rules",
}
# An item judged by rules alone (no AI comparison) is never rated strong.
RULES_ONLY_CAP = 75

_DIGIT_WORDS = {
    "zero": "0", "oh": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
}


def make_part(key: str, score: float | None, detail: str) -> dict[str, Any]:
    clean = None if score is None else int(max(0, min(100, round(score))))
    return {"key": key, "label": LABELS[key], "score": clean, "detail": detail}


def combine(parts: list[dict[str, Any]]) -> int | None:
    """Weighted average of the parts that have a score."""
    total = weight = 0
    for item in parts:
        if item["score"] is None:
            continue
        share = WEIGHTS.get(item["key"], 0)
        total += share * item["score"]
        weight += share
    return None if weight == 0 else int(round(total / weight))


def item_score(parts: list[dict[str, Any]], *, needs_ai: bool) -> tuple[int | None, list[str]]:
    """The item score and any extra reasons.

    When the item needs the AI comparison and it did not produce a number, the
    item is "not scored": rule checks alone must not look like an AI verdict.
    """
    by_key = {item["key"]: item for item in parts}
    if needs_ai:
        vision = by_key.get("vision")
        if vision is None or vision["score"] is None:
            return None, ["The AI comparison did not give a result, so this item is not scored."]
        return combine(parts), []
    score = combine(parts)
    if score is None:
        return None, []
    if score > RULES_ONLY_CAP:
        return RULES_ONLY_CAP, [
            "Only the rule checks were used (no Before/After comparison), so this is not rated strong."
        ]
    return score, []


# ---------- the comparison answer ----------

def vision_score(answer: dict[str, Any]) -> tuple[int, list[str]]:
    """Muse Spark's confidence as 0-100, lowered when it says the files do not match up."""
    score = float(answer["confidence"]) * 100
    reasons: list[str] = []
    if not answer["same_scene"]:
        score = min(score, 40)
        reasons.append("The Before and After files do not seem to show the same place.")
    if not answer["work_visible_after"]:
        score = min(score, 45)
        reasons.append("The After file does not clearly show the finished work.")
    for flag in answer.get("flags", []):
        reasons.append("Model flag: " + str(flag).replace("_", " ") + ".")
    if not reasons and answer.get("change_summary"):
        reasons.append(str(answer["change_summary"]))
    return int(round(score)), reasons


# ---------- the same part in both files ----------

def _area(box: dict[str, Any]) -> float:
    return max(0, box["x2"] - box["x1"] + 1) * max(0, box["y2"] - box["y1"] + 1)


def _centre(box: dict[str, Any]) -> tuple[float, float]:
    w, h = max(1, box["w"]), max(1, box["h"])
    return (box["x1"] + box["x2"]) / 2 / w, (box["y1"] + box["y2"]) / 2 / h


def part_match(
    before: list[dict[str, Any]] | None, after: list[dict[str, Any]] | None
) -> tuple[int | None, str]:
    """Is the outlined part the same in both files? None = could not be checked."""
    if before is None or after is None:
        return None, "The part could not be outlined, so this check was skipped."
    if not before and not after:
        return 20, "The part was not found in either file."
    if not before or not after:
        side = "Before" if not before else "After"
        return 35, f"The part was not found in the {side} file."
    a = max(before, key=_area)
    b = max(after, key=_area)
    (ax, ay), (bx, by) = _centre(a), _centre(b)
    distance = math.hypot(ax - bx, ay - by)
    ratio = min(_area(a), _area(b)) / max(_area(a), _area(b), 1)
    if distance <= 0.25 and ratio >= 0.4:
        return 100, "The same part is outlined in the same place in both files."
    if distance <= 0.5 and ratio >= 0.2:
        return 75, "The part is outlined in both files, but in a different place or size."
    return 50, "The outlined parts differ a lot, so they may not be the same part."


# ---------- the spoken challenge code ----------

def _tokens(text: str) -> list[str]:
    words = [_DIGIT_WORDS.get(w, w) for w in re.findall(r"[a-z]+|\d+", text.lower())]
    glued: list[str] = []
    run = ""
    for word in words:
        if word.isdigit() and len(word) == 1:
            run += word
            continue
        if run:
            glued.append(run)
            run = ""
        glued.append(word)
    if run:
        glued.append(run)
    return glued


def code_matches(transcript: str, code: str) -> bool:
    """Did the worker say the code? Speech is imprecise, so the word may be a near match
    and the number may be said as digits ("four one seven") or as 417."""
    pieces = code.lower().split()
    word = next((p for p in pieces if p.isalpha()), "")
    number = "".join(p for p in pieces if p.isdigit())
    tokens = _tokens(transcript)
    word_ok = not word or any(
        difflib.SequenceMatcher(None, word, token).ratio() >= 0.8
        for token in tokens
        if token.isalpha()
    )
    number_ok = not number or number in tokens
    return word_ok and number_ok


# ---------- the evidence rules ----------

def rules_check(
    have: int, needed: int, duplicates: int, similar: int, integrity_failed: bool
) -> tuple[int | None, str, list[str]]:
    """Score, detail and reasons from the checks the system already ran."""
    if integrity_failed:
        return 0, "A file failed the integrity check.", [
            "A file failed the integrity check, so don't rely on it as proof."
        ]
    if have < needed:
        return None, f"{have} of {needed} files submitted.", [
            f"Only {have} of {needed} required files are submitted."
        ]
    score = 100
    reasons: list[str] = []
    if duplicates:
        score -= 40
        reasons.append("The same file appears more than once in this work order.")
    if similar:
        score -= 25
        reasons.append("A photo looks almost the same as a photo from another task.")
    detail = "No integrity or duplicate warnings." if not reasons else "; ".join(reasons)
    return score, detail, reasons
