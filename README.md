# Proofline AI

Evidence-based verification for real-world work. A **worker** captures Before and After photos or video for a checklist. The system checks the evidence (file integrity, duplicates, AI analysis, a spoken challenge code) and gives a score. A **manager** makes the final decision. Every step is written to an audit trail.

Built for the Meta Global AI Developer Hackathon (Indie Developer track, solo entry).

> The AI gives **advice only**. A person decides. A score never approves or rejects work by itself.

## Roles

There are two roles.

| Role | What they do |
|------|--------------|
| **Manager** | Creates work orders, tasks and checklists, assigns workers, reviews evidence, approves / rejects / asks for more, reads the audit trail, manages the team and roles. |
| **Worker** | Opens assigned tasks (or creates their own work), captures Before and After evidence, records a voice note, runs the AI check, submits for review. |

On **Create account** you choose Manager or Worker (or sign up with Google). A manager can change anyone else's role on the Team page. Nobody can change their own role.

## What it does, step by step

1. A manager creates a work order with tasks and a checklist, and assigns a worker. A worker can also create their own work. A manager reviews it.
2. The worker captures the evidence. Items marked "needs Before and After" need one Before file and one After file. Uploads retry on a bad connection.
3. The worker says the one-time challenge code on camera so the clip is fresh.
4. The AI check runs: Muse Spark compares frames, SAM 3.1 outlines the checked part, Muse Voice Transcribe checks the spoken code.
5. Each checklist item gets a score from 0 to 100. The **task score is the lowest item score**: 85 and above is **Strong**, 60 to 84 is **Check**, below 60 is **Weak**.
6. Submitting produces one combined result per task: `VERIFIED`, `NEEDS_MORE_EVIDENCE`, `FAILED_INSPECTION` or `NEEDS_HUMAN_REVIEW`, with reasons, video timestamps and a follow-up instruction for the worker.
7. The manager reads the evidence and the advice, then approves, rejects, asks for more evidence or escalates, and writes a reason.
8. The audit trail and report show who did what and when.

## Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 17, FFmpeg
- **Frontend:** React 18, TypeScript, Vite, React Router
- **AI:** Meta Muse Spark (frames), SAM 3.1 (segmentation), Muse Voice Transcribe (voice notes). Muse Image is used only to make fake test images for the evaluation.
- **Sign-in:** email and password, or Google

## Install and run

Pick **one**: Docker (recommended) or manual.

### Option A: Docker (recommended)

You need Docker with Docker Compose.

```bash
git clone <your-repo-url> proofline && cd proofline
cp .env.example .env          # then edit .env, see "Settings" below
docker compose up --build -d
docker compose exec api python -m app.seed    # demo users and demo work (run once)
```

Open http://localhost:8080. The API is at http://localhost:8000 and its docs are at http://localhost:8000/docs.

Database migrations run automatically when the API container starts. Check that everything is healthy:

```bash
docker compose ps                       # api and db should show "healthy"
curl http://127.0.0.1:8000/health       # {"status":"healthy", ... "database":"connected"}
```

Stop with `docker compose down`. Your data stays in Docker volumes. `docker compose down -v` deletes it.

If the `api` container restarts and logs `failed to resolve host 'db'`, recreate the stack: `docker compose down && docker compose up -d --force-recreate`.

### Option B: manual (no Docker)

You need Python 3.12, [uv](https://docs.astral.sh/uv/), Node 20 or newer, PostgreSQL 17 and FFmpeg.

Backend:

```bash
cd backend
uv sync                                  # or: pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg://proofline:password@localhost:5432/proofline
export JWT_SECRET_KEY=$(openssl rand -hex 32)
export EVIDENCE_STORAGE_DIR=$HOME/proofline-evidence   # must be a writable folder
export MODEL_MOCK=true                                  # no AI key needed
mkdir -p "$EVIDENCE_STORAGE_DIR"
uv run alembic upgrade head
uv run python -m app.seed                               # optional demo data
uv run uvicorn app.main:app --reload --port 8000
```

Frontend (second terminal):

```bash
cd frontend
npm ci
npm run dev        # http://localhost:5173, proxies /api to localhost:8000
```

## First login

After seeding, sign in with password `Proofline-Demo-2026`:

| Email | Role |
|-------|------|
| `manager@proofline.demo` | Manager |
| `worker@proofline.demo` | Worker |
| `worker2@proofline.demo` | Worker |

Or click **Create account**, choose Manager or Worker, and register.

## Settings

All settings are environment variables in `.env`. The important ones:

| Variable | Meaning |
|----------|---------|
| `JWT_SECRET_KEY` | **Required.** Long random string. Generate with `openssl rand -hex 32`. |
| `MODEL_API_KEY` | Key for the Meta models. Leave empty if you use mock mode. |
| `MODEL_MOCK` | `true` returns fixed sample AI results so the whole flow works without a key. Mock scores are samples, never evaluation results. |
| `GOOGLE_CLIENT_ID` | Enables Google sign-in and Google sign-up. Leave empty to hide it. |
| `EVIDENCE_STORAGE_DIR` | Where uploaded files are stored. Must be writable. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Database login used by Docker. Change the password outside local use. |
| `VERIFICATION_MIN_CONFIDENCE` | Below this the AI sends the task to a person (default `0.6`). |
| `VERIFICATION_MAX_FOLLOW_UPS` | Retakes the worker gets before a manager steps in (default `3`). |

Never commit `.env`. It holds your keys.

## Upgrading an existing database

This version removes the old inspector role. Migration `8e4f5a6b7c72` turns every existing inspector account into a manager and tightens the role rule. It runs automatically with Docker. Manually: `uv run alembic upgrade head`.

## Tests

```bash
cd backend && DATABASE_URL=sqlite+pysqlite:// JWT_SECRET_KEY=test-only-secret-key-long-enough-32 MODEL_MOCK=true uv run pytest -q
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
```

Live model smoke test (needs a real key and `MODEL_MOCK=false`): `cd backend && uv run python scripts/live_smoke.py`.

## Accuracy: what is and is not measured

Be careful with numbers here.

- **Measured:** the automated test suites (backend and frontend). They check the rules, permissions and flows, not the AI's judgement.
- **Not measured yet:** how often the AI is right. No accuracy or false-approval percentage is claimed in this repository. Mock-mode scores are fixed samples and must never be quoted as results.
- **How to measure it:** make a set of real Before/After pairs and fake ones (Muse Image can make the fakes), run them through the AI check with `MODEL_MOCK=false`, and count how often a fake still scores Strong (the false-approval rate) and how often a real pair scores Weak. Put the counts, the date and the model versions in `docs/evaluation.md`.
- **Why it is safe anyway:** the score is advice. A manager decides, gives a reason, and the decision is logged. The task score is the **lowest** item score, so one weak item cannot hide behind strong ones.

## Main API areas

| Area | Routes |
|------|--------|
| Auth | `/auth/register` (role: manager or worker), `/auth/login`, `/auth/google` (role used only for new accounts), `/auth/me` |
| Team | `/users`, `/users/{id}/role`, `/users/directory` (managers only) |
| Work | `/work-orders`, `/work-orders/{id}/tasks`, `/tasks/{id}/requirements`, `/locations` |
| Evidence | `/tasks/{id}/evidence` (form field `phase`: before, after, other), `/evidence/{id}`, `/evidence/{id}/content`, `/tasks/{id}/submit` |
| AI | `/evidence/{id}/analyze`, `/evidence/{id}/segment`, `/evidence/{id}/duplicates`, `/tasks/{id}/transcribe`, `/tasks/{id}/score/run`, `/tasks/{id}/score`, `/tasks/{id}/challenge` |
| Decision | `/tasks/{id}/verification`, `/tasks/{id}/reviews`, `/work-orders/{id}/audit` |
| Overview | `/dashboard/summary`, `/notifications`, `/health` |

## Known limits

- The rate limiter is in memory (one API process).
- Photos are checked for integrity and duplicates only. The AI looks at video.
- Capture time and GPS are not verified yet.
- Choosing "Manager" on Create account is open to anyone. For a real deployment, require an invite code or let only existing managers create managers.
- AI accuracy has not been measured yet (see above).

## More

- `docs/security-and-privacy.md`: protections, data retention, known limits
- `docs/demo-script.md`: the 3-minute demo
- `frontend/BACKEND_CONTRACT.md`: routes the frontend expects


set -a; source ../.env; set +a
uv run alembic upgrade head  
uv run uvicorn app.main:app --reload --port 8000