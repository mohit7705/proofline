# Demo script (3 minutes)

**Story in one line:** a worker proves the job was done, the system checks it, and a person makes the final call with a
full paper trail.

**Before you start:** `docker compose up -d`, seed once, open http://localhost:8080 in separate manager and worker browser profiles (or sign out between roles). Demo password: `Proofline-Demo-2026`. Keep `MODEL_MOCK=true`.

The seed creates the work order **Boiler 2 weekly inspection** with four tasks:

| Task | State after seeding | What it shows |
|---|---|---|
| Read the pressure gauge | Approved | A finished job |
| Check the relief valve | Submitted, **reuses a photo from the gauge task** | Duplicate detection, "needs a person" |
| Record the meter reading | Waiting for the worker | The worker flow |
| Walk-through video | Submitted, with a saved sample AI analysis | Timestamps, "run analysis again" |

## 0:00 Manager (20 s)

Sign in as `manager@proofline.demo`.
Say: "The manager sees exceptions, not noise." Point at **Tasks awaiting review**, **Need a person** and the
**Needs your attention** list. The relief-valve task is there even though the work order is still "in progress".

## 0:20 Worker (45 s)

Sign in as `worker@proofline.demo` (second window). Open **Record the meter reading**.
Say: "The worker is told exactly what to capture." Show that **Submit for review** is disabled and says what is missing.
Take or choose a photo for "Meter display": the button turns on. Press it. Optional: add a **voice note**.
Say: "The server enforces the same rule, so the screen never promises what the server will refuse."

## 1:05 Manager review (60 s)

Continue as `manager@proofline.demo`. The queue puts **Needs a person** first.
Open **Check the relief valve**. Show the **Photo checks** card: the duplicate check finds the same photo in the gauge task.
Say: "The system flags it. It does not accuse anyone, and it does not decide."
Choose **Approve** without a reason to show the override warning, then choose **Escalate** with a reason and save.
Say: "A person decides, and the reason is recorded."
Open **Walk-through video**. Click a timestamp in the AI analysis: the video jumps to that moment. Optionally press
**Run again** to show the background job finishing by itself.

## 2:05 Back to the manager (45 s)

Open the work order. Show the **History** card: who did what, in plain sentences. Open **Report** and press
**Print or save as PDF**: checklist, evidence with SHA-256 fingerprints, automated advice, decisions, history.
Say: "Every claim is traceable to a file, a frame and a person."

## 2:50 Close (10 s)

"AI is advice. People decide. Everything is on the record."

## If something goes wrong on the day

| Problem | Fix |
|---|---|
| AI says "isn't set up" | `MODEL_MOCK=true` in `.env`, then `docker compose up -d api` |
| Nothing to review | Reseed on a fresh volume: `docker compose down -v`, `up --build`, seed again |
| Microphone blocked | Use `http://localhost:8080`, or skip the voice note |
| Too many requests | Wait the number of seconds shown |

## v2 screens walkthrough (3 minutes)

1. **Worker (0:00).** Sign in and show the Worker badge. Choose **Create my own work**, add a checklist item, then upload a Before and an After photo or video. Say the displayed challenge code in the After recording and run the AI check. Point out the score, score parts, reasons and any retake notes.
2. **Manager (1:00).** Sign in and open the self-created work. Point out its **Self-created** tag, score panel, Before and After files, and SAM outlines. Review the evidence and make the decision yourself; the task creator cannot approve their own work.
3. **Manager (2:00).** Show average scores, weak tasks and self-created work awaiting review on Overview. Open Team, add a team member with a temporary password, and set their role.
4. **Close (2:45).** Explain that AI scores are advisory and do not approve work. Muse Image is used only to create fake completed images for the false-approval evaluation. Show the reported result in `docs/evaluation.md` after running it with real models.
