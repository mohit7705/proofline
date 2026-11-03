# Submission checklist (deadline Nov 4, 9 PM ET)

Do the **Frontend** and **Backend** rows first, then rehearse, then record. Leave the last hours for the video and the form, not for code.

## Code
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass (frontend)
- [ ] Backend tests pass (`uv run pytest`) and CI is green
- [ ] No `.env`, key or password in the repository (`git grep -n "MODEL_API_KEY="` shows only `.env.example`)
- [ ] `frontend/tsconfig.tsbuildinfo` and any `frontend.zip` are not in the repository

## Run it from zero (do this on a clean checkout)
- [ ] `cp .env.example .env`, set `JWT_SECRET_KEY`, `MODEL_MOCK=true`
- [ ] `docker compose up --build`, then `docker compose exec api python -m app.seed`
- [ ] http://localhost:8080 loads and all three demo accounts work

## Real flow (one pass, as real people)
- [ ] Register a manager account and a worker account with the role picker
- [ ] Manager creates a work order with a task and a required checklist item, assigns the worker
- [ ] Worker cannot submit early, uploads, submits
- [ ] The manager review page shows it; the verification panel shows advice
- [ ] Run the video analysis (mock), click a timestamp
- [ ] Request more evidence; the worker sees the reason; upload again; resubmit
- [ ] Approve; the work order becomes approved by itself
- [ ] History lists every step with names; the Report prints on one clean A4 flow

## Screens and devices
- [ ] Check 360 px (phone), 768 px (tablet) and 1280 px (desktop) on: login, worker task, manager review, manager overview, report preview
- [ ] Open the hosted site on a real phone: take a photo, upload, submit
- [ ] Keyboard only: sign in, open a task, submit the decision form, close a dialog (no mouse)
- [ ] Zoom to 200 percent: nothing overlaps or is cut off

## Submission pack
- [ ] Screenshots: overview, worker with blocked Submit, manager review with duplicate warning, AI timestamps, report
- [ ] 3-minute video following `docs/demo-script.md`
- [ ] Short description: problem, how it works, "AI is advice, a person decides", what is real and what is mock
- [ ] Say plainly in the write-up that the demo used `MODEL_MOCK=true` if it did
- [ ] Links: repository, hosted demo (if any), video
- [ ] Submit at least an hour early
