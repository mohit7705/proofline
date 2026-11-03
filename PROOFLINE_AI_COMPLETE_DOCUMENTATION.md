# Proofline AI: Complete Project Documentation

One document that merges the database schema, design system, accessibility audit, security and privacy, evaluation method, real-flow check, demo script, submission checklist and project structure.

**Product in one line:** a worker proves a job was done, the system checks it, and a person makes the final call with a full paper trail.
**Rule of the product:** AI is advice. People decide. Everything is on the record.
**Repository:** https://github.com/mohit7705/proofline
**Entry:** Meta Global AI Developer Hackathon, Indie Developer track, solo. Deadline: Nov 4, 9 PM ET.

## Contents

1. [Overview and principles](#1-overview-and-principles)
2. [Roles and workflow](#2-roles-and-workflow)
3. [Project structure](#3-project-structure)
4. [Database schema](#4-database-schema)
5. [Scoring and decision states](#5-scoring-and-decision-states)
6. [Design system](#6-design-system)
7. [Accessibility](#7-accessibility)
8. [Security and privacy](#8-security-and-privacy)
9. [Evaluation: false approvals](#9-evaluation-false-approvals)
10. [Real flow check](#10-real-flow-check)
11. [Demo script](#11-demo-script)
12. [Submission checklist](#12-submission-checklist)
13. [Run commands](#13-run-commands)
14. [Known gaps and open items](#14-known-gaps-and-open-items)

---

## 1. Overview and principles

Database principles:

- PostgreSQL is the source of truth for application records.
- UUID primary keys for business entities. Timestamps in UTC, timezone-aware.
- Media lives in file storage. PostgreSQL stores metadata and references.
- Verification history and audit events are preserved, never silently overwritten.
- AI results support human decisions. They do not prove a job was completed.

Design principles:

1. **Evidence first.** Screens show what was captured, what was checked and what is still open.
2. **Colour is never the only signal.** Every status has an icon and a word.
3. **Say what happened.** Errors explain the problem and the fix. Empty screens say what to do next.
4. **Never fake certainty.** A screen that waits on the backend says so. Nothing shows made-up data.
5. **Navigation is not security.** Hiding a route is a courtesy. The backend decides who may do what.

## 2. Roles and workflow

| Role | Can do |
|---|---|
| **Manager** | Create work orders, tasks, checklists, locations. Assign workers. Review evidence. Approve, reject, ask for more, escalate. Read audit trail and reports. Manage team and roles. |
| **Worker** | Open assigned tasks, or create their own AI-checked work. Capture Before and After evidence. Record a voice note. Run the AI check. Submit. Mark own work done after a Strong score. |

Only **manager** and **worker** exist (the inspector role was removed; migration `8e4f5a6b7c72` converts old inspectors to managers). Users choose a role on Create account, with optional Google sign-up. Nobody can change their own role.

**Journeys**

- **Manager:** sign in, see exceptions on Overview, create a work order with tasks and checklist, assign a worker, watch it move to submitted, review the evidence, record a decision with a reason, open the report.
- **Worker:** sign in, open a task, read what to capture, accept the recording notice once, take or choose photos and clips, watch progress, retry a failed file, run the AI check, submit.
- **Self-created work:** a worker creates AI-checked work. No human review. When the score is **Strong** the worker can press **Mark as done**. A task creator cannot approve manager-assigned work.

## 3. Project structure

```text
.
├── .github/workflows/ci.yml
├── backend/
│   ├── alembic.ini, Dockerfile, docker-entrypoint.sh, pyproject.toml,
│   │   requirements.txt, uv.lock
│   ├── app/
│   │   ├── main.py, seed.py
│   │   ├── ai/         client.py, mock.py
│   │   ├── api/        ai_jobs, auth, challenge, dashboard, evidence, locations,
│   │   │               requirements, score_jobs, scores, tasks, users,
│   │   │               verification, video_analysis, workflow, work_orders, routes/
│   │   ├── core/       config, database, dependencies, middleware,
│   │   │               rate_limit, security
│   │   ├── models/     audit_event, base, evidence, location, organization,
│   │   │               requirement, review_decision, score_job, task,
│   │   │               task_score, task_verification, user,
│   │   │               verification_run, work_order
│   │   ├── schemas/    auth, evidence, requirement, review, score_job, scoring,
│   │   │               task, verification, video_analysis(_api), work_order
│   │   └── services/   analysis_access, audit, challenge, dashboard,
│   │                   evidence_integrity, evidence_phases, evidence_segmentation,
│   │                   evidence_video, requirements, score_ai, score_jobs,
│   │                   score_parts, score_signals, scoring, speech_transcription,
│   │                   tasks, verification_engine, video_analysis, video_frames,
│   │                   video_verification, workflow, work_orders
│   ├── migrations/versions/   15 Alembic revisions (core schema through
│   │                          remove_inspector_role)
│   ├── scripts/live_smoke.py
│   └── tests/          ~30 test files + fixtures (png, ppm, wav)
├── frontend/
│   ├── Dockerfile, nginx.conf, package.json, vite.config.ts, tsconfig.json,
│   │   eslint.config.js, index.html, public/favicon.svg
│   └── src/
│       ├── app/        App, providers, router
│       ├── components/ evidence/ forms/ layout/ ui/
│       ├── features/   analysis audit auth manager notifications reports
│       │               review worker work-orders
│       ├── hooks/      useLoad usePolling useMedia useOnline useVoiceRecorder
│       │               useLandingMotion
│       ├── lib/        analysis audit dashboard decision evidence format
│       │               notifications status wav workflow (+ tests)
│       ├── pages/      Landing, HowItWorks, Security, Login, Register, NotFound,
│       │               Forbidden, WorkerDashboard, manager/*, worker/*
│       ├── services/   api, auth, session (+ tests)
│       ├── styles/     tokens base layout ui auth landing landing3d dashboard
│       │               evidence score worker worker-premium worker-settings
│       │               manager-overview manager-premium
│       └── types/
├── docs/               accessibility, database-schema, demo-script, design-system,
│                       evaluation, real-flow-check, security-and-privacy,
│                       submission-checklist
├── scripts/eval_false_approval.py
├── docker-compose.yml, .env.example, .dockerignore, .gitignore, README.md
```

**Clean-up flagged by the tree** (do before submitting): `backend/backend.zip`, `frontend/frontend.zip`, `docker and all.zip`, `frontend/tsconfig.tsbuildinfo`, `.env` and `frontend/.env.local` should not be in the repository. Empty folders `.agents`, `.aws`, `.codex` can be removed.

## 4. Database schema

### Core entities

**users**: `id` UUID PK, `email` unique, `password_hash` (never plaintext), `full_name`, `role` (manager or worker), `is_active` default true, `created_at`, `updated_at`. Google sign-in fields were added by migration `9a7f3c2d1b60`.

**work_orders**: `id`, `title`, `description`, `created_by` FK users, `assigned_to` nullable FK users, `status` (draft, open, in_progress, submitted, under_review, approved, rejected, cancelled), `due_at` nullable, timestamps. Self-created work uses `is_self_created` and `created_by`.

**tasks**: `id`, `work_order_id` FK, `title`, `instructions`, `status` (pending, in_progress, submitted, approved, rejected), `position`, timestamps.

**evidence**: `id`, `task_id` FK, `submitted_by` FK, `media_type` (image or video), `storage_key` (private reference, not a public URL), `original_filename`, `content_type`, `size_bytes`, `sha256_hash` (nullable until integrity processing), `captured_at` (untrusted client claim), `uploaded_at` (server time), `integrity_status` (pending, passed, flagged, failed), `created_at`. Phase: before, after or other.

**verification_runs**: `id`, `evidence_id` FK, `model_name`, `model_version`, `status` (pending, processing, completed, failed), `findings` JSON, `confidence` 0 to 1, `started_at`, `completed_at`, `created_at`.

**review_decisions**: `id`, `task_id` FK, `reviewer_id` FK, `decision` (approved, rejected, needs_more_evidence), `reason` required, `created_at`.

**audit_events**: `id`, `actor_id` nullable FK, `entity_type`, `entity_id`, `action`, `details` JSON (no secrets), `created_at`.

Additional tables in the code (see `models/`): `organization`, `location`, `requirement` (checklist), `task_verification`, `task_score`, `score_job`. This document does not list their columns; read the models for them.

### Relationships

- A manager creates many work orders. A work order has many tasks and one assigned worker.
- A task has many evidence submissions and many review decisions over time.
- Evidence has many verification runs.
- Audit events record important actions across the workflow.

### Constraints and indexes

- Unique `users.email`.
- Indexes: `work_orders (created_by, status)`, `(assigned_to, status)`, `due_at`; `tasks (work_order_id, status)`; `evidence (task_id, uploaded_at)`, `sha256_hash`; `verification_runs (evidence_id, created_at)`; `review_decisions (task_id, created_at)`; `audit_events (entity_type, entity_id, created_at)`.
- Enforce valid roles, statuses, non-negative file sizes and confidence in [0, 1].
- Foreign keys with deliberate deletion rules. Preserve audit and review history.

### Security and integrity rules for data

- Authorization is enforced in the API, not only the UI.
- Workers submit evidence only for tasks they may access. Only authorised reviewers record decisions.
- `captured_at` is untrusted. File hashes are calculated on the server after upload.
- Credentials, secrets and private storage URLs stay out of logs.
- Important status changes and verification decisions go into `audit_events`.

### Evidence deletion rules (added in v2)

`DELETE /evidence/{id}`: a worker may delete only their own files. Approved tasks are locked. Deleting from a submitted task withdraws the submission back to `in_progress` and records `task.withdrawn`.

## 5. Scoring and decision states

**Score bands:** Strong 85 or more, Check 60 to 84, Weak below 60.

**Per item:** four parts with weights vision 50, part 20, code 15, rules 15. **Task score = the lowest item score.** A score is stale if files changed after it was produced.

**Self-complete** (`POST /tasks/{id}/complete`): worker only, only for their own self-created work, task must be `submitted`, score must be fresh and Strong. Result: status `approved`, event `task.self_completed`.

**Decision states from the evidence gate**

| Verdict | Label | Tone | Meaning |
|---|---|---|---|
| `verified` | Verified | ok | Every required check is backed by a real frame and nothing looks off |
| `needs_evidence` | Needs more evidence | warn | A view is missing, blocked or too far away |
| `failed` | Failed inspection | fail | Footage clearly shows a required condition is not met |
| `needs_review` | Needs human review | review | Evidence conflicts, looks reused, or is beyond the checks |
| `pending` | Waiting for evidence | pending | Nothing submitted yet |

**Status maps**

| Work order | Label | Tone | | Task | Label | Tone |
|---|---|---|---|---|---|---|
| draft | Draft | pending | | pending | Not started | pending |
| open | Open | info | | in_progress | In progress | info |
| in_progress | In progress | info | | submitted | Awaiting review | review |
| submitted | Submitted | review | | approved | Approved | ok |
| under_review | Under review | review | | rejected | Needs correction | fail |
| approved | Approved | ok | | | | |
| rejected | Rejected | fail | | | | |
| cancelled | Cancelled | pending | | | | |

## 6. Design system

Source of truth: `frontend/src/styles/tokens.css`. If this and the CSS disagree, the CSS wins.

### Colour

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0f1530` | Headings, body |
| `--ink-2` | `#3a4262` | Secondary text |
| `--ink-3` | `#5f6988` | Muted text |
| `--paper` | `#f4f5fa` | Page background |
| `--surface` | `#ffffff` | Cards, inputs, tables |
| `--surface-2` | `#eef0f8` | Table headers, subtle panels |
| `--line`, `--line-strong` | `#e2e5f0`, `#cdd2e3` | Dividers, input borders |
| `--brand` | `#2d4bff` | Primary buttons, links, focus ring |
| `--brand-hover` | `#2039d6` | Primary hover |
| `--brand-soft` | `#e6eaff` | Soft fills |
| `--dark`, `--dark-2`, `--dark-3` | `#0f1530`, `#171e42`, `#202853` | Sidebar, auth side panel |
| `--on-dark`, `--on-dark-2` | `#f4f5ff`, `#aab2d6` | Text on dark |

**Status tones**

| Tone | Text | Soft background | Meaning |
|---|---|---|---|
| ok | `#0a7a52` | `#dcf5ea` | Done, approved, verified |
| warn | `#9a5b00` | `#fdeecb` | Needs attention |
| fail | `#c62828` | `#fde4e2` | Rejected, failed, overdue |
| review | `#6b3fd4` | `#ece6fc` | Waiting for a person |
| pending | `#5d6684` | `#e9ebf4` | Not started, draft, cancelled |
| info | `#2039d6` | `#e6eaff` | Open, in progress |

### Typography

| Role | Family | Use |
|---|---|---|
| Display | Bricolage Grotesque (`--font-display`) | Headings, big numbers, logo |
| Text | Schibsted Grotesk (`--font-body`) | Everything else |
| Mono | System monospace (`--font-mono`) | Hashes, ids |

Fluid scale (rem): `--step--1` 0.80 to 0.86, `--step-0` 0.94 to 1.03, `--step-1` 1.10 to 1.28, `--step-2` 1.40 to 1.80, `--step-3` 1.85 to 2.70, `--step-4` 2.50 to 4.50. Headings use tight spacing and `text-wrap: balance`. Line length under about 75 characters.

### Layout, shape, depth

- Container `--max` 76rem, side padding `--gutter` 1rem to 2.5rem.
- App shell: 16.5rem dark sidebar, top bar with notification bell, page in `<main id="main">`. Under 60rem the sidebar becomes a slide-in menu.
- Spacing is written in rem, not tokenised (only `--gutter`, `--max` are).
- Radius: `--r-xs` 6px, `--r-s` 10px, `--r-m` 14px, `--r-l` 22px. Shadows: `--shadow-s`, `--shadow-m`, `--shadow-l`. `--ring` is the input focus glow.
- Signature detail: viewfinder corner brackets (`.bracketed`) on anything being inspected.
- Motion: landing frame scans once; everything else uses short transitions. `prefers-reduced-motion` turns animation off.
- Breakpoints (max-width, rem): 72 and 66 (wide grids lose a column), **60 (sidebar collapses, pages stack)**, 52 and 48 (tables scroll, tabs tighter), 40 and 36 (forms one column).

### Components

| Group | Components |
|---|---|
| Buttons | `Button` (variants primary, secondary, ghost, danger, dark, outline-light; sizes s, m, l), `ButtonLink`, `IconButton` (label required) |
| Forms | `TextField`, `PasswordField`, `SelectField`, `TextAreaField`, `CheckboxField`, `InlineSelect` (label, hint and error wired with `aria-describedby`) |
| Status | `StatusBadge`, `VerdictBadge`, `Alert`, `ErrorState`, `EmptyState`, `PendingBackend`, `Toast`, `Spinner`, `Skeleton`, `PageLoading` |
| Structure | `Card`, `CardHeader`, `PageHeader` (the page's one `h1`), `Stat`, `Tabs`, `Pagination`, `Stepper`, `ProgressBar`, `Avatar`, `Dialog`, `ConfirmDialog` (native `<dialog>`) |
| Layout | `AppShell`, `AuthLayout`, `PublicNav`, `Footer`, `Logo`, `ActionCenter`, `ScrollManager` |
| Evidence | `EvidenceList`, `MediaViewer`, `EvidenceCompare`, `RequirementCoverage`, `InspectionFrame`, `ScoreRing`, `ScoreChip` |

Use one `primary` button per screen area. Use `danger` only for actions that cannot be undone.

### Page map

| Route | Who | Purpose |
|---|---|---|
| `/` | Everyone | Landing: problem, decision process, four outcomes, fake-evidence defences, models |
| `/how-it-works`, `/security` | Everyone | Process and security pages |
| `/login`, `/register` | Signed out | Email and password or Google; register with Manager or Worker role |
| `/manager` | Manager | Overview: open, overdue, awaiting review, unassigned, due soon, scores |
| `/manager/work-orders` | Manager | Search, filter, page |
| `/manager/work-orders/new` | Manager | Wizard: details, tasks and checklist, review |
| `/manager/work-orders/:orderId` | Manager | Detail: status actions, tasks, checklists, report |
| `/manager/locations` | Manager | Sites, buildings, floors, rooms, equipment |
| `/manager/team` | Manager | Users and roles |
| `/worker` | Worker | Assigned tasks, capture, upload with progress |
| `/worker/ai-insights` and other worker pages | Worker | AI insights, evidence, history, help, settings |
| `*` | Everyone | Not found |
| wrong-role route | Signed in | Access denied with link to own workspace |

### Rules for new components

1. Every control has a visible or screen-reader label.
2. Every status uses an icon and a word.
3. Text meets 4.5:1 (3:1 for 18.5px bold or larger). Check new pairs first.
4. Keyboard works alone. Never remove the 3px `:focus-visible` outline.
5. One `h1` per page. Headings go down one level at a time.
6. Loading and error states use `role="status"` or `role="alert"`.
7. Respect `prefers-reduced-motion`.

## 7. Accessibility

Target: **WCAG 2.2 level AA.**

### Code audit

| Check | Result | Notes |
|---|---|---|
| Page language | Pass | `<html lang="en">` |
| Skip link | Pass | "Skip to content" jumps to `#main` |
| Visible focus | Pass | Global 3px brand outline; inputs have brand border and soft ring |
| Reduced motion | Pass | Animations and transitions shortened |
| Form labels | Pass | Every field renders a `<label>`. Three hidden file inputs are opened by labelled buttons |
| Icon-only buttons | Pass | `IconButton` requires `label`; close buttons have `aria-label` |
| Status not by colour alone | Pass | Icon and word always |
| Dialogs | Pass | Native `<dialog>`: focus trap, Escape, titled |
| Errors and loading | Pass | `role="alert"`, `role="status"`, toasts `aria-live="polite"` |
| Page titles | **Fixed** | `ScrollManager` sets one per route |
| Text contrast | **Fixed** | See below |
| Tap target size | Pass | Buttons 2.3rem (about 37px) or more; primary 2.75rem or more |

### Contrast (needs 4.5:1)

| Pair | Before | After |
|---|---|---|
| Body on page | 16.48 | 16.48 |
| Secondary on white | 9.83 | 9.83 |
| Muted on white | 4.91 | 5.44 |
| Muted on page | 4.51 | 4.99 |
| Muted on `--surface-2` | **4.31** | 4.78 |
| Brand text on white | 5.90 | 5.90 |
| White on brand button | 5.90 | 5.90 |
| `ok` badge | **4.37** | 4.67 |
| `warn` / `fail` / `review` / `pending` / `info` badges | 4.72 / 4.65 / 5.26 / 4.77 / 6.72 | same |
| Light on dark sidebar / muted light on dark | 16.54 / 8.59 | same |

Input borders (`--line-strong` on white) are 1.51:1, below the 3:1 guideline for control edges. Optional fix, not applied: `.input { border-color: #8f98b5; }`.

### Manual checklist (about 30 minutes)

**Keyboard only**
- [ ] Landing: Tab reaches every link and button in order. Mobile menu and bell open with Enter; bell closes with Escape.
- [ ] Sign in: email, password (with show/hide), Sign in, Google. Enter submits.
- [ ] Wrong password shows an error read out without moving focus.
- [ ] Manager sidebar reachable; skip link appears on first Tab and works.
- [ ] New work order is completable without a mouse; errors sit next to fields.
- [ ] Dialog: focus moves in, stays inside, Escape closes, focus returns to the opener.
- [ ] Worker capture buttons work with Enter and Space; Retry and Remove reachable.
- [ ] Manager decision options change with arrow keys; Enter submits.

**Screen reader** (NVDA, VoiceOver or TalkBack)
- [ ] Each page's tab title is announced and matches.
- [ ] One main heading per page.
- [ ] Badges read as words.
- [ ] Upload progress announces file name and percentage.
- [ ] Toasts are announced.
- [ ] Tables have header rows; each row's title is read first.

**Zoom, size, motion**
- [ ] 200% zoom: nothing cut off, no sideways scroll outside tables.
- [ ] 360px wide: every screen usable.
- [ ] OS "reduce motion": landing frame stops animating.
- [ ] Forced colours: buttons, inputs and badges keep visible edges.

**Automated:** run axe DevTools or WAVE on `/`, `/login`, `/register`, `/manager`, `/manager/work-orders/new`, `/worker`, `/worker/tasks`. Fix Critical and Serious. Lighthouse Accessibility: aim for 95 or more.

Known gaps: focus does not move to the `h1` after a route change; input borders are light.

## 8. Security and privacy

**Accounts and access**
- Argon2 password hashes, minimum 12 characters. 30-minute tokens. Optional Google sign-in.
- Roles manager and worker, checked on every route. A worker sees only assigned work; another worker's data answers "not found".
- Rate limits per address per minute: login 10, register 5, Google 10.

**Evidence**
- Only JPG, PNG, WebP, MP4, WebM. The server checks extension, declared type and first bytes. Limits 25 MB image, 100 MB video.
- SHA-256 at upload; every later check compares the stored file. A mismatch marks it `failed` and the task `FAILED_INSPECTION`.
- Exact duplicates and very similar photos inside one work order are flagged for a person.
- Files stored outside the web root in a private volume, served only through authorised routes.

**AI**
- Advice only. Never approves or rejects. Only a manager saves the decision.
- Text inside images is untrusted and never an instruction.
- A voice transcript is a claim, not proof. Only text goes to the audit trail; audio is not kept.
- AI routes rate limited to 20 requests per minute per user.
- No `MODEL_API_KEY` means AI routes answer 503. `MODEL_MOCK=true` uses fixed samples for demos and tests.

**Audit trail:** every important action writes an audit event in the same transaction. No route edits or deletes audit events.

**Web security:** request id and basic security headers on every response (`nosniff`, no framing, no referrer); sign-in responses not cached. Logs hold method, path, status, time and request id only (never tokens, passwords, query strings, bodies). CORS is off unless `CORS_ORIGINS` is set; Docker uses one origin through nginx. Unexpected errors return a short message and request id, never a stack trace.

**Data retention (pilot rule):** keep evidence and audit events while the work order exists. Recommended: delete photos and videos of closed work orders after 90 days, keep audit and hashes. Until automatic clean-up exists, delete by hand and record the removal with the manager's name. Workers see a consent notice before the first capture.

**Known limits:** token in session storage (httpOnly cookie is safer); in-memory rate limiter (use Redis for several processes); no malware scan or app-level encryption (use an encrypted volume); capture time and GPS not verified.

**Your own action items:** rotate any `MODEL_API_KEY` or `JWT_SECRET_KEY` that was ever shared, and keep `.env`, `.env.bak` and `.env.local` out of git.

## 9. Evaluation: false approvals

**Question:** when the After image is fake, how often does Proofline give a Strong score (85 or more)?

**Method**
1. Use one real Before photo of a place or item.
2. Create fake "completed" After images with Muse Image. Never present them as real work.
3. Put the real image at `eval_set/before.jpg` and fakes in `eval_set/fakes/`.
4. Run with real models (`MODEL_MOCK=false`) against a disposable database:

```bash
python scripts/eval_false_approval.py \
  --api http://localhost:8000 \
  --email worker@example.com \
  --password 'your-password' \
  --dir eval_set \
  --out eval_result.json
```

5. Record image count, scored pairs, Strong scores and the false-approval rate. Unscored pairs are reported separately and are not counted as passes.

The script creates a work order, task, requirement, evidence and score job per fake. Those stay in the database.

**Results (not yet run, fill in):** run date __ · images __ · scored __ · Strong (false approvals) __ · rate __ % · model and version __

**Limits:** small self-made set, not real fraud rates. A high score approves nothing alone. Mock output is sample data and must never be reported as a result. Also measure the reverse: how often a real pair scores Weak.

## 10. Real flow check

Goal: walk the whole product with real accounts against the live backend. About 30 minutes. Outcomes **Works today** and **Waiting on the backend** are acceptable; anything else is a bug.

> Note: this check was written earlier. The routes it calls "waiting on the backend" (evidence list, decisions, verification) now exist, so expect them to work.

**0. Start:** `docker compose up --build`; in `frontend/` run `npm install` and `npm run dev`; open http://localhost:5173. After manager sign-in the sidebar footer shows **Server connected**. If it says "Database unreachable" or "Server unreachable", fix that first, and set `JWT_SECRET_KEY`.

**1. Accounts:** register `manager@test.local` (Manager) and `worker@test.local` (Worker), 12+ character passwords. An 11-character password is refused; a duplicate email shows "An account with this email already exists". Manager lands on `/manager`. Team page lists both; own row shows "Cannot change own role".

**2. Manager creates a work order:** empty title then Next shows an error. Fill title, description, future due date. Add task "Repair the wall crack" with checklist "Close-up of the repair" (photo, min 1, max 3), assign the worker, new location. Add a second task needing 2 files. Review, tick **Open for work right away**, create. Expect toast "Work order created." and status **Open**.
*Failure recovery:* `docker compose stop api` mid-creation, start it, press Create again. Expect an error saying what was saved and a retry that creates no duplicate.

**3. Worker uploads:** lands on `/worker`; first visit shows **Before you record** and hides upload buttons until accepted. Upload a photo (progress, "done", count rises) and a video under 100 MB. Error cases: `.pdf` or `.gif` refused with allowed types; JPEG over 25 MB refused; `notes.txt` renamed to `notes.jpg` refused by the server; going offline mid-upload shows **failed**, then **Retry** finishes with one copy only.

**4. Manager reviews:** open the work order and the task awaiting review; see checklist, evidence, decision history, verification panel. Choose Approve with an unmet required item: expect an override warning requiring a reason. Submit a decision and confirm it is recorded.

**5. Permissions** (copy tokens from DevTools > Session storage `proofline.access_token`):

```bash
API=http://localhost:8000
WORKER_TOKEN=...; MANAGER_TOKEN=...; MANAGER_ID=...   # id from GET /auth/me

# worker lists users            -> 403
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $WORKER_TOKEN" $API/users
# worker creates a work order   -> 403
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $WORKER_TOKEN" \
  -H "Content-Type: application/json" -d '{"title":"x y z","description":"d"}' $API/work-orders
# manager changes own role      -> 403
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH -H "Authorization: Bearer $MANAGER_TOKEN" \
  -H "Content-Type: application/json" -d '{"role":"worker"}' $API/users/$MANAGER_ID/role
# no token                      -> 401
curl -s -o /dev/null -w "%{http_code}\n" $API/work-orders
```

In the browser as the worker, open `/manager`: expect access denied with a link to `/worker`. Signed out, open `/worker`: expect sign-in. Corrupt the stored token and reload: expect sign-in with no crash.

**6. Reports and bell:** open a work order Report and print with Ctrl+P. The bell lists real overdue, awaiting-review and unassigned items; create an overdue work order and confirm it appears.

**7. Record results** (done when every row is Works today or Waiting on the backend, no Bug):

| Area | Result | Notes |
|---|---|---|
| Register and sign in | | |
| Google sign-in (if configured) | | |
| Roles and team page | | |
| Work-order wizard | | |
| Failure recovery in the wizard | | |
| Worker upload and progress | | |
| Retry after a network drop | | |
| Rejected file types and sizes | | |
| Evidence list after reload | | |
| Manager decision | | |
| Permission checks (curl) | | |
| Route guard (wrong role) | | |
| Expired session | | |
| Report and print | | |
| Notification bell | | |

## 11. Demo script

**3 minutes.** Before starting: `docker compose up -d`, seed once, open http://localhost:8080 in separate manager and worker profiles. Password `Proofline-Demo-2026`. Keep `MODEL_MOCK=true` unless you have a real key.

Seed creates **Boiler 2 weekly inspection**:

| Task | State | Shows |
|---|---|---|
| Read the pressure gauge | Approved | A finished job |
| Check the relief valve | Submitted, reuses a gauge photo | Duplicate detection, "needs a person" |
| Record the meter reading | Waiting for worker | Worker flow |
| Walk-through video | Submitted, saved AI analysis | Timestamps, "run analysis again" |

| Time | Who | Do and say |
|---|---|---|
| 0:00 (20 s) | Manager `manager@proofline.demo` | "The manager sees exceptions, not noise." Point at Tasks awaiting review, Need a person, Needs your attention. |
| 0:20 (45 s) | Worker `worker@proofline.demo` | Open Record the meter reading. "The worker is told exactly what to capture." Submit is disabled and says what is missing. Add a photo for "Meter display", press Submit. Optional voice note. "The server enforces the same rule." |
| 1:05 (60 s) | Manager | Queue shows Needs a person first. Open Check the relief valve; Photo checks shows the duplicate. "The system flags it. It does not accuse anyone, and it does not decide." Approve without a reason (override warning), then Escalate with a reason. "A person decides, and the reason is recorded." Open Walk-through video, click a timestamp, optionally Run again. |
| 2:05 (45 s) | Manager | Open the work order: History card. Open Report, Print or save as PDF. "Every claim is traceable to a file, a frame and a person." |
| 2:50 (10 s) | Close | "AI is advice. People decide. Everything is on the record." |

**If something goes wrong**

| Problem | Fix |
|---|---|
| AI says "isn't set up" | `MODEL_MOCK=true` in `.env`, then `docker compose up -d api` |
| Nothing to review | `docker compose down -v`, `up --build`, seed again |
| Microphone blocked | Use `http://localhost:8080` or skip the voice note |
| Too many requests | Wait the number of seconds shown |

### v2 walkthrough (3 minutes)

1. **Worker (0:00).** Show the Worker badge. Choose **Create my own work**, add a checklist item, upload a Before and an After photo or video. Say the displayed challenge code in the After recording and run the AI check. Point out score, parts, reasons and retake notes.
2. **Manager (1:00).** Open the self-created work: **Self-created** tag, score panel, Before and After files, SAM outlines. Decide yourself; the creator cannot approve their own work.
3. **Manager (2:00).** Overview shows average scores, weak tasks and self-created work awaiting review. Open Team, add a member with a temporary password, set their role.
4. **Close (2:45).** AI scores are advisory. Muse Image only makes fake completed images for the false-approval evaluation. Show the result in `docs/evaluation.md` once you have run it with real models.

## 12. Submission checklist

**Deadline: Nov 4, 9 PM ET** (about Nov 5, 7:30 AM IST). Do code first, rehearse, then record. Leave the last hours for video and form. Submit at least an hour early.

**Code**
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass
- [ ] `uv run pytest` passes and CI is green
- [ ] No `.env`, key or password in git (`git grep -n "MODEL_API_KEY="` shows only `.env.example`)
- [ ] `frontend/tsconfig.tsbuildinfo` and any zip files are not in the repository

**Run from zero on a clean checkout**
- [ ] `cp .env.example .env`, set `JWT_SECRET_KEY`, `MODEL_MOCK=true`
- [ ] `docker compose up --build`, then `docker compose exec api python -m app.seed`
- [ ] http://localhost:8080 loads and the demo accounts work

**Real flow (as real people)**
- [ ] Register a manager and a worker with the role picker
- [ ] Manager creates a work order with a task and required checklist item, assigns the worker
- [ ] Worker cannot submit early, uploads, submits
- [ ] Manager review shows it with advice in the verification panel
- [ ] Run video analysis (mock), click a timestamp
- [ ] Request more evidence; worker sees the reason; uploads again; resubmits
- [ ] Approve; the work order becomes approved by itself
- [ ] History lists every step with names; the Report prints on one clean A4 flow

**Screens and devices**
- [ ] 360 px, 768 px, 1280 px on login, worker task, manager review, manager overview, report preview
- [ ] Hosted site on a real phone: take a photo, upload, submit
- [ ] Keyboard only: sign in, open a task, submit the decision form, close a dialog
- [ ] 200% zoom: nothing overlaps or is cut off

**Submission pack**
- [ ] Screenshots: overview, worker with blocked Submit, manager review with duplicate warning, AI timestamps, report
- [ ] 3-minute video following the demo script
- [ ] Short description: problem, how it works, "AI is advice, a person decides", what is real and what is mock
- [ ] State plainly if the demo used `MODEL_MOCK=true`
- [ ] Links: repository, hosted demo (if any), video

**Extra items for the hackathon rubric (strong repos usually show these):** a clear README with install steps, a live deployment link, diagrams in the docs, a visible automated test suite, a modular `src/` layout, and clear use of the Meta model API (Muse Spark, SAM 3.1, Muse Voice Transcribe). Commit steadily; the count of commits in the window may be judged.

## 13. Run commands

**Docker**

```bash
cp .env.example .env            # set JWT_SECRET_KEY, MODEL_MOCK
docker compose up --build -d
docker compose exec api python -m app.seed
# web http://localhost:8080 · API http://localhost:8000/docs
docker compose up -d --force-recreate   # if the api cannot resolve host 'db'
```

**Backend with real models (manual)**

```bash
mkdir -p ~/proofline-data/evidence
cd backend
set -a; source ../.env; set +a
export MODEL_MOCK=false
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

**Tests**

```bash
cd backend && DATABASE_URL=sqlite+pysqlite:// JWT_SECRET_KEY=test-only-secret-key-long-enough-32 MODEL_MOCK=true uv run pytest -q
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
```

Last recorded: backend 276 passed, 1 skipped; frontend 145 passed.

## 14. Known gaps and open items

| Item | Status |
|---|---|
| AI accuracy / false-approval rate | **Not measured.** Run the evaluation and fill section 9. |
| Real-model path (`live_smoke.py`, `MODEL_MOCK=false`) | Not yet run by the assistant; run it yourself. |
| Anyone can pick Manager at sign-up | Open. Add an invite code or manager-only creation for production. |
| Rate limiter in memory | Single process only. |
| httpOnly cookie, malware scan, app-level encryption | Not done. |
| Capture time and GPS verification | Not done. |
| Focus to `h1` on route change; light input borders | Not done. |
| Photos | Checked for integrity and duplicates; AI analysis is on video. |
| Repository clean-up (zips, `.env`, tsbuildinfo, empty `.agents/.aws/.codex`) | Do before submitting. |
| Rotate exposed secrets | Do before submitting. |
