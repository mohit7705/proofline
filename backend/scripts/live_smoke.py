"""Live check of the whole backend with the REAL models (Muse Spark, SAM 3.1,
Muse Voice Transcribe). Uses the API key from the project .env.

Run (backend already started with MODEL_MOCK=false):
  uv run python scripts/live_smoke.py --email worker@proofline.demo --password '...'
"""

import argparse
import io
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

import httpx
from PIL import Image, ImageDraw

OK, BAD = "PASS", "FAIL"
failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"{OK if ok else BAD}: {name} {detail}")
    if not ok:
        failures.append(name)


def scene(color, mark=False, shift=0) -> bytes:
    img = Image.new("RGB", (640, 480), color)
    d = ImageDraw.Draw(img)
    d.ellipse((220 + shift, 140, 420 + shift, 340), fill=(240, 180, 30))
    d.rectangle((40, 400, 600, 440), fill=(60, 60, 60))
    if mark:
        d.line((220 + shift, 340, 420 + shift, 140), fill=(0, 160, 60), width=14)
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue()


def video_with_tone(path: Path) -> bytes:
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
         "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=10",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
         "-t", "4", "-pix_fmt", "yuv420p", "-c:a", "aac", str(path)],
        check=True, timeout=60,
    )
    return path.read_bytes()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://127.0.0.1:8000")
    ap.add_argument("--email", required=True)
    ap.add_argument("--password", required=True)
    args = ap.parse_args()

    c = httpx.Client(base_url=args.api, timeout=180)
    r = c.post("/auth/login", json={"email": args.email, "password": args.password})
    check("login", r.status_code == 200, str(r.status_code))
    if r.status_code != 200:
        return 1
    c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    me = c.get("/auth/me").json()
    check("role visible", bool(me.get("role")), f"role={me.get('role')}")

    def new_task(title):
        o = c.post("/work-orders", json={"title": f"live {title} {uuid.uuid4().hex[:5]}",
                                         "description": "live smoke", "assigned_to": me["id"]})
        check(f"create work order ({title})", o.status_code == 201, o.text[:120])
        t = c.post(f"/work-orders/{o.json()['id']}/tasks",
                   json={"title": title, "instructions": "Show the yellow circle, then draw a green line across it",
                         "assigned_to": me["id"]}).json()
        q = c.post(f"/tasks/{t['id']}/requirements",
                   json={"title": "Yellow circle", "instructions": "Show the yellow circle. After the work a green diagonal line is drawn across it.",
                         "requires_before_after": True}).json()
        return t["id"], q["id"]

    def upload(task, req, phase, name, data, mime):
        r = c.post(f"/tasks/{task}/evidence", data={"requirement_id": req, "phase": phase},
                   files={"file": (name, data, mime)})
        check(f"upload {phase} {name}", r.status_code in (200, 201), f"{r.status_code} {r.text[:100]}")

    def run_score(task, label):
        r = c.post(f"/tasks/{task}/score/run")
        check(f"start AI check ({label})", r.status_code == 202, f"{r.status_code} {r.text[:120]}")
        if r.status_code != 202:
            return None
        status = "queued"
        for _ in range(60):
            time.sleep(3)
            status = c.get(f"/tasks/{task}/score/job").json()["status"]
            if status in {"completed", "failed"}:
                break
        check(f"run finished ({label})", status == "completed", f"status={status}")
        score = c.get(f"/tasks/{task}/score").json()
        t = score.get("task") or {}
        print(f"  task score={t.get('score')} band={t.get('band')} models={score.get('model_name')}")
        for item in score.get("items", []):
            for p in item["parts"]:
                print(f"   - {p['label']}: {p['score']}  {p['detail']}")
            for why in item["reasons"]:
                print(f"   * {why}")
        a = c.get(f"/tasks/{task}/score/analysis").json()
        print(f"  analysis available={a.get('available')} mock={a.get('mock')}")
        for note in a.get("retake_notes", []):
            print(f"   retake: {note}")
        check(f"real models used, not mock ({label})", bool(a.get("available")) and not a.get("mock"))
        return score

    # 1) Same scene before and after, work visible: should score well
    t1, r1 = new_task("good pair")
    upload(t1, r1, "before", "before.png", scene((30, 90, 160)), "image/png")
    upload(t1, r1, "after", "after.png", scene((30, 90, 160), mark=True), "image/png")
    good = run_score(t1, "good pair")

    # 2) Unrelated After image: should score lower
    t2, r2 = new_task("wrong scene")
    upload(t2, r2, "before", "before.png", scene((30, 90, 160)), "image/png")
    upload(t2, r2, "after", "after.png", scene((170, 90, 40), shift=-120), "image/png")
    bad = run_score(t2, "wrong scene")
    if good and bad and good["task"]["score"] is not None and bad["task"]["score"] is not None:
        check("wrong scene scores lower than good pair",
              bad["task"]["score"] < good["task"]["score"],
              f"{bad['task']['score']} < {good['task']['score']}")

    # 3) After VIDEO with sound: tests Muse Voice Transcribe (a tone has no words).
    #    The challenge code must exist BEFORE the After video is uploaded, or the
    #    speech check is skipped.
    t3, r3 = new_task("video with sound")
    upload(t3, r3, "before", "before.png", scene((30, 90, 160)), "image/png")
    code = c.get(f"/tasks/{t3}/challenge").json().get("code")
    check("challenge code issued", bool(code), f"code={code}")
    time.sleep(3)
    with tempfile.TemporaryDirectory() as d:
        data = video_with_tone(Path(d) / "after.mp4")
    upload(t3, r3, "after", "after.mp4", data, "video/mp4")
    run_score(t3, "video with sound")
    a3 = c.get(f"/tasks/{t3}/score/analysis").json()
    code_info = ((a3.get("items") or [{}])[0].get("code")) or {}
    print(f"  code check: {code_info}")
    check("speech check ran", code_info.get("heard") is not None,
          "(a tone has no speech, so heard=False is the expected result)")

    print("\nRESULT:", "ALL PASSED" if not failures else f"{len(failures)} FAILED: {failures}")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
