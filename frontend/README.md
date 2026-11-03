# Proofline frontend

React 18, TypeScript and Vite. It talks to the FastAPI backend in `../backend`. There is no mock data: every number and
list on screen comes from the API. The full list of routes and response shapes is in `BACKEND_CONTRACT.md`.

## Run everything with Docker (recommended for the demo)

From the repository root:

```bash
cp .env.example .env            # set JWT_SECRET_KEY; MODEL_MOCK=true needs no AI key
docker compose up --build
docker compose exec api python -m app.seed   # demo users and a demo work order (run once)
```

Open http://localhost:8080. Demo logins (password `Proofline-Demo-2026`):

| Email | Role |
|---|---|
| `manager@proofline.demo` | Manager |
| `worker@proofline.demo`, `worker2@proofline.demo` | Worker |
| `inspector@proofline.demo` | Inspector |

The web container (nginx) serves this app and forwards `/api/` to the `api` service.

## Run the frontend on its own (development)

```bash
npm install
npm run dev              # http://localhost:5173
```

The dev server forwards `/api/*` to `http://localhost:8000` and removes the `/api` prefix, so start the backend first
(`docker compose up api db` from the repository root). The microphone (voice notes) only works on `localhost` or HTTPS.

## First manager account

New accounts start as workers. On a fresh database either run the seed script (it creates `manager@proofline.demo`) or
promote your own account once:

```bash
docker compose exec db psql -U proofline -d proofline \
  -c "UPDATE users SET role='manager' WHERE email='you@example.com';"
```

After that, managers change other people's roles under **Team and roles**. Sign out and back in to see the new workspace.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the built app locally |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier (write or check) |
| `npm test` | Vitest, run once |
| `npm run test:watch` | Vitest, re-run on change |

## Environment

| Variable | Purpose |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Shows "Continue with Google". Must match `GOOGLE_CLIENT_ID` on the backend |
| `VITE_API_BASE` | API base URL. Default `/api` (same origin, through the Vite proxy or nginx) |

Both are public and baked into the bundle at build time. Never put a secret in a `VITE_` variable. In Docker they are
passed as build arguments by the `web` service in the root `docker-compose.yml`.

## Roles and screens

| Role | Route | What they do |
|---|---|---|
| Public | `/`, `/how-it-works`, `/security`, `/login`, `/register` | Landing, how decisions are made, security and privacy, sign in, create account |
| Manager | `/manager` and below | Overview (counts, what needs attention), work orders and a creation wizard, work-order detail with status, tasks, checklists, **History** and a printable **Report**, locations, people and roles |
| Worker | `/worker` | Assigned tasks, capture with a checklist of required shots, upload queue with retry, Submit for review (enabled only when the required evidence is there), optional voice note, the reviewer's reason when a task is sent back |
| Inspector | `/inspector` | Review queue sorted by urgency, evidence viewer and compare, AI video analysis with clickable timestamps, duplicate check and object highlighting for photos, automated advice, decision form (Approve, Request more evidence, Reject, Escalate) with a reason |

Route guards in `src/app/router.tsx` only steer navigation. The backend enforces the real permissions on every endpoint.

## How a task moves

1. The worker uploads evidence and presses **Submit for review**. The server refuses it (422) if a required item is short.
2. The server writes an automated result. It is **advice**; it never approves or rejects.
3. An inspector or manager decides: approve, request more evidence, reject, or **escalate** (the task stays waiting for a manager).
4. The work-order status follows its tasks by itself. Nobody sets "approved" on a work order directly.
5. Everything important is written to the audit trail, shown as **History** and in the **Report**.

## Project layout

```
src/
  app/          router and providers
  components/   ui, forms, layout and evidence building blocks
  features/     auth, analysis, audit, inspector, manager, notifications, reports, work-orders, worker
  hooks/        useLoad, useMedia, useOnline, usePolling, useVoiceRecorder
  lib/          format, status, evidence, audit, analysis, dashboard, notifications, wav (unit tested)
  pages/        one file per screen
  services/     api.ts (every backend call), auth.ts, session.ts
  styles/       tokens.css and the stylesheets
  types/        shared types
```

## Tests

`npm test` runs unit tests for the helpers and the API client, and component tests for the screens that carry the
rules: the Submit button, the decision form, the verification panel, the upload queue and the analysis panel.

## Troubleshooting

| You see | Why | What to do |
|---|---|---|
| "AI isn't set up on this server (no model key)" | `MODEL_API_KEY` is empty and `MODEL_MOCK` is false | Set `MODEL_MOCK=true` for the demo, or add a key, then restart `api` |
| "Too many requests. Try again in N seconds." | Rate limit (login: 10 per minute; AI calls: 20 per minute per person) | Wait. Behind nginx, `TRUST_PROXY_HEADERS=true` must be set or all people share one limit |
| Voice note says the microphone is blocked | Browsers allow it only on `localhost` or HTTPS | Use `http://localhost:8080` or serve over HTTPS |
| A file says "failed its integrity check" | The stored file no longer matches the fingerprint taken at upload | Do not rely on it. Ask the worker to upload it again |
| Inspectors see `User 3fa9…` instead of names | The names directory did not load | Check the server connection and retry |

## Known limits

- The session token is kept in `sessionStorage` and cleared on a 401 and when the tab closes. An httpOnly cookie would be
  safer and needs a backend change.
- Uploads go one file at a time and are never retried automatically.
- "Highlight objects" draws boxes only, not the outline masks the backend also returns.
- Voice notes need a WAV the server can read. The browser recorder makes a 16 kHz mono WAV; other files must already be WAV.
- Notifications refresh every minute, not instantly.
- Fonts load from Google Fonts through `index.html`. To avoid that third-party call in production, self-host them and remove the `<link>` tags.
- "Verified" means the configured checks were supported by the submitted evidence. It is not a safety or compliance
  certificate, and the report says so.
