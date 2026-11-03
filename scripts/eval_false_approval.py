"""Measure how often fake "completed" images receive a Strong task score.

Expected input layout::

    eval_set/
      before.jpg
      fakes/*.jpg|*.jpeg|*.png

The fake after-images are created separately (for example with Muse Image).
This script does not generate them. Run against a backend configured with a
real model; MODEL_MOCK=true produces sample output that is not an evaluation.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import time
import uuid
from pathlib import Path
from typing import Any

import httpx

STRONG = 85
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def checked_json(response: httpx.Response) -> dict[str, Any]:
    response.raise_for_status()
    return response.json()


def evaluate_image(
    client: httpx.Client,
    user_id: str,
    before: Path,
    fake_after: Path,
    timeout_seconds: int,
) -> dict[str, Any]:
    label = f"eval-{uuid.uuid4().hex[:8]}"
    order = checked_json(
        client.post(
            "/work-orders",
            json={
                "title": label,
                "description": "False-approval evaluation; generated test data.",
                "assigned_to": user_id,
            },
        )
    )
    task = checked_json(
        client.post(
            f"/work-orders/{order['id']}/tasks",
            json={
                "title": "Evaluate completed repair image",
                "instructions": "Check whether the item appears repaired.",
                "assigned_to": user_id,
            },
        )
    )
    requirement = checked_json(
        client.post(
            f"/tasks/{task['id']}/requirements",
            json={
                "title": "The item is repaired",
                "instructions": "Show the repaired item clearly.",
                "requires_before_after": True,
                "minimum_evidence_count": 2,
            },
        )
    )

    for phase, path in (("before", before), ("after", fake_after)):
        media_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
        response = client.post(
            f"/tasks/{task['id']}/evidence",
            data={"requirement_id": requirement["id"], "phase": phase},
            files={"file": (path.name, path.read_bytes(), media_type)},
        )
        response.raise_for_status()

    checked_json(client.post(f"/tasks/{task['id']}/score/run"))
    deadline = time.monotonic() + timeout_seconds
    job: dict[str, Any] = {"status": "queued"}
    while time.monotonic() < deadline:
        time.sleep(min(3, max(0, deadline - time.monotonic())))
        job = checked_json(client.get(f"/tasks/{task['id']}/score/job"))
        if job["status"] in {"completed", "failed"}:
            break

    score = checked_json(client.get(f"/tasks/{task['id']}/score"))
    value = (score.get("task") or {}).get("score")
    return {
        "file": fake_after.name,
        "task_id": task["id"],
        "status": job["status"],
        "score": value,
        "false_approval": value is not None and value >= STRONG,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--dir", required=True, dest="directory")
    parser.add_argument("--out", default="eval_result.json")
    parser.add_argument("--timeout", type=int, default=180, help="Seconds to wait for each score job")
    args = parser.parse_args()

    root = Path(args.directory)
    before = root / "before.jpg"
    fakes = sorted(
        path for path in (root / "fakes").glob("*") if path.suffix.lower() in IMAGE_SUFFIXES
    )
    if not before.is_file() or not fakes:
        print("Need before.jpg and at least one .jpg, .jpeg or .png image in fakes/", file=sys.stderr)
        return 2
    if args.timeout < 1:
        print("--timeout must be at least one second", file=sys.stderr)
        return 2

    try:
        with httpx.Client(base_url=args.api.rstrip("/"), timeout=120) as client:
            login = checked_json(
                client.post("/auth/login", json={"email": args.email, "password": args.password})
            )
            client.headers["Authorization"] = f"Bearer {login['access_token']}"
            user = checked_json(client.get("/auth/me"))

            results = []
            for fake in fakes:
                result = evaluate_image(client, user["id"], before, fake, args.timeout)
                results.append(result)
                print(f"{result['file']}: {result['status']}, score={result['score']}")
    except (httpx.HTTPError, KeyError, ValueError) as error:
        print(f"Evaluation stopped: {error}", file=sys.stderr)
        return 1

    scored = [result for result in results if result["score"] is not None]
    false_approvals = sum(result["false_approval"] for result in scored)
    summary = {
        "images": len(results),
        "scored": len(scored),
        "false_approvals": false_approvals,
        "false_approval_rate": round(false_approvals / len(scored), 3) if scored else None,
        "results": results,
    }
    Path(args.out).write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in summary.items() if key != "results"}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
