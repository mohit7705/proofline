# Proofline AI

**Proof of work, checked by AI, decided by a person.**

Proofline AI is a web app where a worker proves a job was done with photos, video and a short voice note. Meta AI models check that evidence, then a manager makes the final call with a full audit trail. **AI is advice. People decide. Everything is on the record.**

> Built solo for the **Meta Global AI Developer Hackathon** (Indie Developer track).
> Repository: https://github.com/mohit7705/proofline
> Live demo: **`<ADD YOUR DEPLOYED URL HERE>`** · Demo video: **`<ADD VIDEO LINK>`**

---

## Table of contents

1. [The problem](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#1-the-problem)
2. [The solution](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#2-the-solution)
3. [Meta AI tooling used](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#3-meta-ai-tooling-used)
4. [Architecture and diagrams](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#4-architecture-and-diagrams)
5. [Features](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#5-features)
6. [How scoring works](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#6-how-scoring-works)
7. [Tech stack](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#7-tech-stack)
8. [Quick start with Docker](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#8-quick-start-with-docker-recommended)
9. [Manual install (no Docker)](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#9-manual-install-no-docker)
10. [Configuration](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#10-configuration)
11. [Demo accounts and the 3-minute demo](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#11-demo-accounts-and-the-3-minute-demo)
12. [Running with the real Meta models](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#12-running-with-the-real-meta-models)
13. [Tests and quality checks](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#13-tests-and-quality-checks)
14. [Project structure](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#14-project-structure)
15. [API overview](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#15-api-overview)
16. [Security and privacy](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#16-security-and-privacy)
17. [Evaluation and accuracy](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#17-evaluation-and-accuracy)
18. [Deployment](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#18-deployment)
19. [Known limits](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#19-known-limits)
20. [Documentation index](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#20-documentation-index)
21. [Troubleshooting](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#21-troubleshooting)

---

## 1. The problem

Field work, maintenance, inspections and repairs are paid and signed off on the word of the person who did them. Managers see a photo, a text message or nothing at all. That creates real costs:

- **Fake or reused proof.** The same photo is sent for two different jobs. An old photo is passed off as new. A generated image shows "finished" work that never happened.
- **Vague proof.** A blurry photo, the wrong room, or a close-up that hides the actual fault.
- **Slow review.** Managers open every submission one by one, so the real exceptions are buried in noise.
- **No paper trail.** When a job is disputed later, nobody can say who approved it, on what evidence, or why.
- **Self-checking.** Workers who create their own work have nobody to check it, so they either skip checks or wait for a manager who does not need to be involved.

Existing tools (chat apps, shared drives, generic forms) store files but do not **check** them, and none of them separates *what the AI thinks* from *who decided*.

**Who it is for:** facility and maintenance teams, inspection contractors, property managers, small service businesses, and any manager who pays for work they cannot watch.

## 2. The solution

Proofline AI turns "trust me, it's done" into a checked, traceable record.

1. A **manager** creates a work order with tasks and a checklist (what must be photographed or filmed).
2. A **worker** gets exactly what to capture. They cannot submit until every required item is covered. The server enforces the same rule.
3. The worker uploads **Before** and **After** photos or video, and may add a **voice note**.
4. The worker says a one-time **challenge code** on camera so the clip is fresh. The system fingerprints every file (SHA-256), flags duplicates and near-duplicates, and asks Meta models to check it: Muse Spark compares frames, SAM 3.1 outlines the checked part, Muse Voice Transcribe checks the spoken code.
Submitting produces one result per task: `VERIFIED`, `NEEDS_MORE_EVIDENCE`, `FAILED_INSPECTION` or `NEEDS_HUMAN_REVIEW`, with reasons, video timestamps and a follow-up instruction for the worker.
5. The worker sees a clear **AI check report** with a score, reasons and retake notes, and can fix problems before anyone else looks.
6. A **manager** reviews only what needs a person, sees the AI advice next to the files, and records a decision **with a reason**.
7. Every step is written to an **audit trail**, and a printable **report** lists the checklist, files with fingerprints, AI advice, decisions and history.

**Self-created work.** A worker can create their own AI-checked work. No human review is required: when the AI score is **Strong**, the worker can press **Mark as done**. Manager-assigned work is never approved by the worker.

## 3. Meta AI tooling used

Meta model
What it does in Proofline
Where in the code

**Muse Spark 1.3**
Looks at photos and video frames. Judges whether each checklist item is really shown, whether the part and the code or label are visible, and whether the rules are met. Produces reasons, retake notes and video timestamps.
`backend/app/ai/client.py`, `services/score_ai.py`, `services/verification_engine.py`, `services/video_analysis.py`, `services/video_verification.py`

**SAM 3.1**
Segments the object in an image so the work area is outlined. Managers see the outlines on the evidence.
`services/evidence_segmentation.py`

**Muse Voice Transcribe 1.0**
Turns the worker's voice note into text for the task history. The audio is not kept. A transcript is a claim, not proof.
`services/speech_transcription.py`

**Muse Image**
Used **only** to make fake "completed" images for the false-approval evaluation. It is never used in the product flow.
`scripts/eval_false_approval.py`

All model calls go through one adapter (`backend/app/ai/client.py`), with a deterministic mock (`app/ai/mock.py`) for demos and tests. AI routes answer **503** when no key is set and mock mode is off. They never silently fake a result.

Text found inside images is treated as untrusted and is never followed as an instruction.

## 4. Architecture and diagrams

### 4.1 System overview

```
flowchart LR
  subgraph Browser
    W[Worker app]
    M[Manager app]
  end
  subgraph Web["nginx :8080"]
    FE[React + Vite build]
    PX["/api proxy"]
  end
  subgraph API["FastAPI :8000"]
    AUTH[Auth and roles]
    WF[Work orders, tasks, workflow]
    EV[Evidence and integrity]
    SC[Score jobs]
    AU[Audit trail]
  end
  DB[(PostgreSQL)]
  FS[(Private evidence volume)]
  subgraph Meta["Meta models"]
    SPARK[Muse Spark 1.3]
    SAM[SAM 3.1]
    VOICE[Muse Voice Transcribe 1.0]
  end
  W --> FE
  M --> FE
  FE --> PX --> API
  API --> DB
  EV --> FS
  SC --> SPARK
  EV --> SAM
  EV --> VOICE
  AUTH --> AU
  WF --> AU
```

### 4.2 From upload to decision

```
sequenceDiagram
  participant Wk as Worker
  participant API as FastAPI
  participant DB as PostgreSQL
  participant AI as Meta models
  participant Mg as Manager
  Wk->>API: Upload Before / After files
  API->>API: Check type, magic bytes, size
  API->>DB: Save file metadata + SHA-256
  API->>API: Duplicate and near-duplicate check
  Wk->>API: Submit for review
  API->>AI: Score job (vision, part, code, rules)
  AI-->>API: Findings, reasons, retake notes
  API->>DB: Save score set (advice only)
  API-->>Wk: AI check report
  Mg->>API: Open task, read AI advice
  Mg->>API: Decision + reason
  API->>DB: Save decision + audit event
  API-->>Wk: Approved / needs more evidence
```

### 4.3 Task states

```
stateDiagram-v2
  [*] --> pending
  pending --> in_progress: worker starts
  in_progress --> submitted: submit for review
  submitted --> in_progress: files changed (withdrawn)
  submitted --> approved: manager approves
  submitted --> rejected: manager asks for correction
  rejected --> in_progress: worker fixes
  submitted --> approved: worker Mark as done (self-created work, Strong score only)
  approved --> [*]
```

### 4.4 Data model

```
erDiagram
  USERS ||--o{ WORK_ORDERS : creates
  USERS ||--o{ WORK_ORDERS : "assigned to"
  WORK_ORDERS ||--o{ TASKS : has
  TASKS ||--o{ REQUIREMENTS : "checklist"
  TASKS ||--o{ EVIDENCE : "has files"
  EVIDENCE ||--o{ VERIFICATION_RUNS : "checked by"
  TASKS ||--o{ TASK_SCORES : "scored"
  TASKS ||--o{ REVIEW_DECISIONS : "decided"
  USERS ||--o{ REVIEW_DECISIONS : records
  USERS ||--o{ AUDIT_EVENTS : acts
  WORK_ORDERS }o--o| LOCATIONS : "at"
```

See [`PROOFLINE_AI_COMPLETE_DOCUMENTATION.md`](https://claude.ai/chat/PROOFLINE_AI_COMPLETE_DOCUMENTATION.md) (section 4) for every field, index and rule.

### 4.5 Decision states

```
flowchart TD
  A[Evidence submitted] --> B{Every required view<br/>backed by a real frame?}
  B -- no --> NE[Needs more evidence]
  B -- yes --> C{Reused, conflicting<br/>or unclear?}
  C -- yes --> NR[Needs human review]
  C -- no --> D{Clear failure shown?}
  D -- yes --> F[Failed inspection]
  D -- no --> V[Verified]
```

## 5. Features

### Manager

- **Overview**: tasks awaiting review, "need a person" first, due soon, overdue, average scores, weak tasks, self-created work awaiting review.
- **Work orders**: search, filter, page. A 3-step wizard (details, tasks and checklist, review) with **failure recovery** (retry continues without creating a duplicate).
- **Review**: play video with clickable AI timestamps, compare two files side by side, see SAM outlines, coverage of each checklist item, and the photo checks card.
- **Decision form**: approve, request more evidence, or escalate. Approving over a failed check warns about an override and **requires a reason**.
- **Team and roles**: add a member with a temporary password and change roles. You cannot change your own role.
- **Locations**: sites, buildings, floors, rooms, equipment.
- **Report**: printable (A4) report with checklist, evidence and SHA-256 fingerprints, AI advice, decisions and history.
- **Notification bell**: built from real work orders (overdue, awaiting review, unassigned).

### Worker

- **My tasks** with exactly what to capture. **Submit for review** stays disabled and says what is missing.
- **Capture** photos and clips with upload progress, retry after a network drop, and no duplicate files.
- **Before and After** boxes with **Replace** and **Remove**. Changing a file after submit withdraws the submission.
- **Voice note** (optional), with a **Show more / Show less** fold for long transcripts.
- **AI check report**: score ring, band scale, per-item breakdown, retake notes, and a **Back to photos** button.
- **Create my own work**: AI-checked work with a challenge code, and **Mark as done** after a Strong score.
- **AI Insights**, history, evidence and settings pages.

### Everyone

- Sign up as **Manager or Worker**, with optional Google sign-up. Light and dark themes, phone-friendly layout, keyboard and screen-reader support (WCAG 2.2 AA target).

## 6. How scoring works

Band
Score
Meaning

**Strong**
85 or more
Evidence looks right. Worker may Mark as done (self-created only).

**Check**
60 to 84
Needs a closer look or a retake.

**Weak**
below 60
Evidence does not show the work.

- Each checklist item is scored from four parts: **vision 50 %**, **part 20 %**, **code 15 %**, **rules 15 %**.
- The **task score is the lowest item score**. One weak item cannot be hidden by strong ones.
- A score becomes **stale** if files change after scoring. A stale score cannot be used to mark work as done.
- Exact and very similar duplicates inside a work order are flagged for a person.
- **A score never approves work by itself on manager-assigned jobs.** A manager saves the decision.

## 7. Tech stack

Layer
Tools

Frontend
React 18, TypeScript, Vite 5, React Router 6, Vitest, plain CSS with design tokens

Backend
Python 3.12, FastAPI, SQLAlchemy 2, Alembic, psycopg 3, Pillow, ffmpeg, Argon2, `uv`

Database
PostgreSQL (SQLite in memory for tests)

AI
Muse Spark 1.3, SAM 3.1, Muse Voice Transcribe 1.0 (Muse Image for the test set only)

Run and CI
Docker Compose, nginx, GitHub Actions

## 8. Quick start with Docker (recommended)

**You need:** Docker with Compose v2, and git. Nothing else.

```
# 1. Get the code
git clone https://github.com/mohit7705/proofline.git
cd proofline

# 2. Create your settings
cp .env.example .env
#   Open .env and set:
#     JWT_SECRET_KEY=<a long random string, 32+ characters>
#     MODEL_MOCK=true        # sample AI answers, no key needed

# 3. Build and start everything (database, api, web)
docker compose up --build -d

# 4. Add the demo data (once)
docker compose exec api python -m app.seed

# 5. Open the app
#    http://localhost:8080     (web)
#    http://localhost:8000/docs (API docs)
```

Useful commands:

```
docker compose ps                 # api and db should show "healthy"
curl http://127.0.0.1:8000/health # {"status":"healthy", ... "database":"connected"}
docker compose logs -f api        # watch the API
docker compose down               # stop (keeps data)
docker compose down -v            # stop and wipe the database and files
docker compose up -d --force-recreate   # fixes "failed to resolve host 'db'"
```

Migrations run automatically when the `api` container starts.

## 9. Manual install (no Docker)

**You need:** Python 3.12, [`uv`](https://docs.astral.sh/uv/), Node 20+, PostgreSQL 17, and FFmpeg.

### 9.1 Database

```
createdb proofline          # or use any PostgreSQL you already have
```

### 9.2 Backend

```
cd backend
uv sync                                   # or: pip install -r requirements.txt

export DATABASE_URL=postgresql+psycopg://proofline:password@localhost:5432/proofline
export JWT_SECRET_KEY=$(openssl rand -hex 32)
export EVIDENCE_STORAGE_DIR=$HOME/proofline-evidence   # must be writable
export MODEL_MOCK=true                                  # no AI key needed
mkdir -p "$EVIDENCE_STORAGE_DIR"

uv run alembic upgrade head              # create the tables
uv run python -m app.seed                # demo data (optional)
uv run uvicorn app.main:app --reload --port 8000   # start the API
```

Check: http://localhost:8000/docs

### 9.3 Frontend

```
cd frontend
npm ci
npm run dev                    # http://localhost:5173, proxies /api to localhost:8000
```

If you see `address already in use` on port 8000, stop the other process (`pkill -f "uvicorn app.main"`) and start again.

## 10. Configuration

Copy `.env.example` to `.env`. Never commit `.env`.

Variable
Required
What it does

`JWT_SECRET_KEY`
Yes
Signs login tokens. Use 32+ random characters.

`DATABASE_URL`
Manual install
PostgreSQL connection string. Docker sets it for you.

`MODEL_MOCK`
No
`true` = fixed sample AI answers for demos and tests. Mock scores are samples, never evaluation results. `false` = call the real models.

`MODEL_API_KEY`
For real models
Key for the Meta models. Leave empty in mock mode. Without it (and mock off), AI routes answer 503.

`GOOGLE_CLIENT_ID`
Optional
Enables Google sign-in and sign-up. Leave empty to hide it.

`EVIDENCE_STORAGE_DIR`
Yes
Where uploaded files are stored. Must be a writable folder.

`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`
Docker
Database login. Change the password outside local use.

`VERIFICATION_MIN_CONFIDENCE`
No
Below this the AI sends the task to a person (default `0.6`).

`VERIFICATION_MAX_FOLLOW_UPS`
No
Retakes the worker gets before a manager steps in (default `3`).

`CORS_ORIGINS`
Only when the web app is on another origin
Allowed sites. Docker uses one origin, so it is not needed.

Check `.env.example` for the full, current list. Generate a secret with `openssl rand -hex 32`.

### Upgrading an existing database

This version removes the old inspector role. Migration `8e4f5a6b7c72` turns every existing inspector into a manager and limits roles to manager and worker. It runs automatically with Docker. Manually: `uv run alembic upgrade head`.

## 11. Demo accounts and the 3-minute demo

After seeding: password for every demo account is `Proofline-Demo-2026`.

Role
Email

Manager
`manager@proofline.demo`

Worker
`worker@proofline.demo`

Worker
`worker2@proofline.demo`

Or click **Create account**, choose Manager or Worker (or sign up with Google), and register.

The seed creates **Boiler 2 weekly inspection** with four tasks:

Task
State
What it shows

Read the pressure gauge
Approved
A finished job

Check the relief valve
Submitted, **reuses a photo from the gauge task**
Duplicate detection, "needs a person"

Record the meter reading
Waiting for the worker
The worker flow and the blocked Submit

Walk-through video
Submitted, with a saved AI analysis
Clickable timestamps, "run analysis again"

Follow the demo script in [`PROOFLINE_AI_COMPLETE_DOCUMENTATION.md`](https://claude.ai/chat/PROOFLINE_AI_COMPLETE_DOCUMENTATION.md) (section 11) for the timed script. Use two browser profiles (or sign out between roles).

## 12. Running with the real Meta models

```
cd backend
set -a; source ../.env; set +a      # loads MODEL_API_KEY and the rest
export MODEL_MOCK=false
mkdir -p ~/proofline-data/evidence
uv run uvicorn app.main:app --port 8000
```

Smoke-test the live models:

```
uv run python scripts/live_smoke.py
```

Say plainly in any write-up whether a demo used `MODEL_MOCK=true`.

## 13. Tests and quality checks

```
# Backend (SQLite in memory, mock models)
cd backend
DATABASE_URL=sqlite+pysqlite:// \
JWT_SECRET_KEY=test-only-secret-key-long-enough-32 \
MODEL_MOCK=true uv run pytest -q

# Frontend
cd frontend
npm run typecheck && npm run lint && npm test && npm run build
```

Last recorded results: **backend 276 passed, 1 skipped**; **frontend 145 tests passed**, typecheck, lint and build clean. CI (`.github/workflows/ci.yml`) runs the same checks.

Test coverage includes: auth and roles, permissions, work orders, requirements and evidence rules, uploads and integrity, duplicates, segmentation, video analysis and frames, verification engine, score jobs, self-created work and Mark as done, evidence deletion, and the AI client adapters.

## 14. Project structure

```
.
├── backend/
│   ├── app/
│   │   ├── ai/            client.py (model adapter), mock.py (sample answers)
│   │   ├── api/           auth, users, work_orders, tasks, requirements, evidence,
│   │   │                  workflow, verification, video_analysis, scores,
│   │   │                  score_jobs, ai_jobs, challenge, dashboard, locations
│   │   ├── core/          config, database, dependencies (roles), middleware,
│   │   │                  rate_limit, security
│   │   ├── models/        SQLAlchemy tables (users, work_order, task, evidence,
│   │   │                  requirement, task_score, score_job, audit_event, ...)
│   │   ├── schemas/       Pydantic request and response models
│   │   ├── services/      business logic: scoring, integrity, segmentation,
│   │   │                  video, transcription, workflow, audit, dashboard
│   │   ├── main.py        app entry
│   │   └── seed.py        demo data
│   ├── migrations/        Alembic versions
│   ├── scripts/           live_smoke.py
│   ├── tests/             pytest suite and fixtures
│   ├── Dockerfile, docker-entrypoint.sh, pyproject.toml, uv.lock
├── frontend/
│   ├── src/
│   │   ├── app/           router, providers
│   │   ├── components/    ui, forms, layout, evidence
│   │   ├── features/      analysis, audit, auth, manager, notifications,
│   │   │                  reports, review, worker, work-orders
│   │   ├── hooks/         useLoad, usePolling, useVoiceRecorder, ...
│   │   ├── lib/           pure logic (status, decision, dashboard, wav, ...)
│   │   ├── pages/         public, manager/, worker/
│   │   ├── services/      API client, auth, session
│   │   ├── styles/        tokens.css and page styles
│   │   └── types/
│   ├── Dockerfile, nginx.conf, vite.config.ts
├── PROOFLINE_AI_COMPLETE_DOCUMENTATION.md   all project docs in one file
├── scripts/               eval_false_approval.py
├── docker-compose.yml
├── .env.example
└── .github/workflows/ci.yml
```

The backend is layered: **API routes** (thin) call **services** (rules) which use **models** (data). The frontend keeps pure logic in `lib/` so it is easy to test.

## 15. API overview

Interactive docs: `http://localhost:8000/docs`. Every route checks the role on the server.

Area
Examples

Auth
`/auth/register` (role: manager or worker), `/auth/login`, `/auth/google` (role used only for new accounts), `/auth/me`

Team
`/users`, `/users/{id}/role`, `/users/directory` (managers only)

Work
`/work-orders`, `/work-orders/{id}/tasks`, `/tasks/{id}/requirements`, `/locations`

Evidence
`/tasks/{id}/evidence` (form field `phase`: before, after, other), `/evidence/{id}`, `/evidence/{id}/content`, `/tasks/{id}/submit`, `DELETE /evidence/{id}` (own files; approved is locked; submitted is withdrawn)

AI
`/evidence/{id}/analyze`, `/evidence/{id}/segment`, `/evidence/{id}/duplicates`, `/tasks/{id}/transcribe`, `/tasks/{id}/score/run`, `/tasks/{id}/score`, `/tasks/{id}/challenge` (rate limited: 20/min/user)

Decision
`/tasks/{id}/verification`, `/tasks/{id}/reviews`, `/work-orders/{id}/audit`, `POST /tasks/{id}/complete` (self-created work, Strong score only)

Overview
`/dashboard/summary`, `/notifications`, `/health`

Status codes to expect: `401` no or bad token, `403` wrong role, `404` not yours, `409` wrong state, `429` too many requests, `503` AI not configured.

## 16. Security and privacy

- Argon2 password hashes, 12+ character passwords, 30-minute tokens, optional Google sign-in.
- Two roles, **manager** and **worker**, checked on every route. A worker sees only assigned work. Another worker's data answers "not found".
- Rate limits: login 10, register 5, Google 10 per minute per address; AI 20 per minute per user.
- Uploads: JPG, PNG, WebP, MP4, WebM only. Extension, declared type and first bytes are checked. Limits: 25 MB image, 100 MB video.
- SHA-256 at upload. Every later check compares the stored file. A mismatch marks the file `failed`.
- Files live outside the web root and are served only through authorised routes.
- Append-only audit trail, written in the same transaction as each change.
- Security headers, request ids, no secrets or bodies in logs, no stack traces to clients.
- Workers see a consent notice before the first capture. Voice audio is not kept.

Full detail: [`PROOFLINE_AI_COMPLETE_DOCUMENTATION.md`](https://claude.ai/chat/PROOFLINE_AI_COMPLETE_DOCUMENTATION.md) (section 8).

## 17. Evaluation and accuracy

**There are no accuracy numbers in this README on purpose.** Mock mode produces sample numbers only, and they are not a result.

The question we test: *when the After image is fake, how often does Proofline give a Strong score (85 or more)?*

```
python scripts/eval_false_approval.py \
  --api http://localhost:8000 \
  --email worker@example.com \
  --password 'your-password' \
  --dir eval_set \
  --out eval_result.json
```

Put one real Before photo at `eval_set/before.jpg` and fake After images (made with Muse Image) in `eval_set/fakes/`. Run with `MODEL_MOCK=false` against a disposable database. Then fill in the results in section 9 of [`PROOFLINE_AI_COMPLETE_DOCUMENTATION.md`](https://claude.ai/chat/PROOFLINE_AI_COMPLETE_DOCUMENTATION.md).

Measure
Result

Run date
`<fill in>`

Images / scored pairs
`<fill in>`

Strong scores (false approvals)
`<fill in>`

False-approval rate
`<fill in> %`

Model and version
`<fill in>`

Limits: a small set made by us, not real-world fraud rates. A high score approves nothing on its own.

## 18. Deployment

Live demo: `<ADD URL>`

The stack is one `docker compose` file, so any Linux server with Docker works:

```
git clone https://github.com/mohit7705/proofline.git && cd proofline
cp .env.example .env        # set JWT_SECRET_KEY, MODEL_API_KEY, MODEL_MOCK
docker compose up --build -d
docker compose exec api python -m app.seed   # optional demo data
```

Put HTTPS in front (Caddy, nginx or your host's proxy). Use an encrypted disk for the evidence volume and back up the database. Camera and microphone capture need `https://` or `localhost`.

## 19. Known limits

- The token is in session storage (an httpOnly cookie would be safer).
- The rate limiter is in memory, so it fits one API process. Use Redis for several.
- Files are not virus-scanned or app-encrypted. Use an encrypted volume.
- Photos are checked for integrity and duplicates only. The AI looks at video.
- Capture time and GPS metadata are not verified.
- AI accuracy has not been measured yet (see section 17).
- Anyone can pick **Manager** at sign-up. Lock this down before production.
- No automatic clean-up of old media yet (recommended: delete media of closed work after 90 days, keep hashes and audit).
- Focus does not move to the page heading after a route change.

## 20. Documentation

All project documentation is merged into one file in the project root: [`PROOFLINE_AI_COMPLETE_DOCUMENTATION.md`](https://claude.ai/chat/PROOFLINE_AI_COMPLETE_DOCUMENTATION.md). It covers the database schema, design system, accessibility, security and privacy, evaluation method, real-flow check, demo script and submission checklist.

## 21. Troubleshooting

Problem
Fix

`DATABASE_URL not configured` when running tests
Run with the env vars shown in [section 13](https://claude.ai/chat/f6780d04-636e-4074-8273-dceeea7b5c06#13-tests-and-quality-checks).

`address already in use` on 8000
`pkill -f "uvicorn app.main"`, then start again.

`failed to resolve host 'db'`
`docker compose down && docker compose up -d --force-recreate`

AI says "isn't set up"
Set `MODEL_MOCK=true` (or a real `MODEL_API_KEY`), then `docker compose up -d api`.

Nothing to review
`docker compose down -v`, `up --build`, seed again.

Microphone blocked
Use `http://localhost:8080`, or skip the voice note.

Too many requests
Wait the number of seconds shown.

---

*AI is advice. People decide. Everything is on the record.*