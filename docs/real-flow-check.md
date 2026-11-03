# Real flow check (roadmap 9.1)

Goal: walk the whole product with real accounts against the live backend and database, and write down what works.
No mock data is involved. About 30 minutes.

How to read the results: **Works today** means the backend already has the route. **Waiting on the backend** means the
screen is built but the route does not exist yet, so the screen should say so plainly. Both are correct outcomes.
Anything else is a bug.

## 0. Start everything

From the repository root:

~~~bash
docker compose up --build
~~~

Wait for the `api` service to be healthy. In a second terminal, from `frontend/`:

~~~bash
npm install
npm run dev
~~~

Open http://localhost:5173. Check: after you sign in as the manager, the sidebar footer shows **Server connected**.
If it says "Database unreachable" or "Server unreachable", fix that first. Also make sure `JWT_SECRET_KEY` is set
in your environment for the compose file.

## 1. Create the two accounts

Use a private window per role, or sign out between roles.

1. Register `manager@test.local` with the Manager role and `worker@test.local` with the Worker role (passwords of 12 or more characters).
   - Expect: the selected role determines the workspace after registration.
   - A password of 11 characters is refused with a clear message.
   - Registering the same email again shows "An account with this email already exists".
2. Sign in as the manager. Expect: `/manager`.
3. Open **Team and roles**. Confirm that both accounts appear and that role changes are limited to Manager and Worker. Your own row shows "Cannot change own role" and its Save button is off.

## 2. Manager creates a work order

1. **New work order**, step 1: leave the title empty and press Next. Expect an error under the field.
2. Fill in a title, a description, and a due date in the future. Next.
3. Step 2: add a task "Repair the wall crack". Add a checklist item "Close-up of the repair": photo evidence, minimum 1, maximum 3.
   Assign it to `worker@test.local`. For location choose **New** and enter a site and room.
4. Add a second task with a checklist item that needs 2 files.
5. Step 3: review, tick **Open for work right away**, create.
   - Expect: the toast "Work order created." and the detail page opens with status **Open**.
   - The tasks and checklist items are listed.

**Failure recovery test:** stop the `api` container partway through creation (`docker compose stop api`), then start it
again and press Create once more. Expect an error that says what was saved so far, and a retry that continues without
creating a duplicate work order.

## 3. Worker uploads evidence

1. Sign in as the worker. Expect `/worker`, and the new task is listed and selected.
2. First visit: a **Before you record** notice appears. The upload buttons stay hidden until you accept it.
3. Upload a real photo to the checklist item.
   - Expect: a progress bar, then "done", and the checklist item's count goes up.
4. Upload a video (MP4 or WebM, under 100 MB). Expect the same.
5. Error cases:
   - A `.pdf` or `.gif` is refused before upload with a message that names the allowed types.
   - A JPEG over 25 MB is refused with the size limit.
   - Rename `notes.txt` to `notes.jpg` and upload it. Expect the server to refuse it (the file content does not match the format).
   - Start a large upload, then turn off Wi-Fi (or use DevTools > Network > Offline). Expect the file to show **failed**, not done.
     Turn the network back on and press **Retry**. Expect it to finish. Check that only one copy of the file exists.
6. Reload the page. **Waiting on the backend:** the "Submitted so far" list says it is waiting on the backend, because
   `GET /tasks/{id}/evidence` does not exist yet.

## 4. Manager reviews

1. Sign in as the manager. Open the work order and the task awaiting review.
2. Open the work order and a task. Expect the checklist and requirements.
3. **Waiting on the backend:** the evidence list, the decision history and the automated verification panel say they are
   waiting on the backend.
4. Under **Your decision**, choose Approve while a required checklist item is unmet. Expect a warning that approving is recorded as an override and
   that a reason is required.
5. Submit a decision. **Waiting on the backend:** expect a clear message that the server does not record review decisions
   yet. It must not say it saved.

## 5. Permissions (the part that matters most)

The backend must refuse these even if the screen hides them. You need each user's token. Sign in as that user,
open DevTools > Application > Session storage, and copy `proofline.access_token`.

~~~bash
API=http://localhost:8000
WORKER_TOKEN=...      # paste the worker's token
MANAGER_TOKEN=...     # paste the manager's token
MANAGER_ID=...        # the manager's account UUID from GET /auth/me

# A worker must not list users          -> expect 403
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $WORKER_TOKEN" $API/users

# A worker must not create a work order -> expect 403
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $WORKER_TOKEN" \
  -H "Content-Type: application/json" -d '{"title":"x y z","description":"d"}' $API/work-orders

# A manager must not change their own role -> expect 403
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH -H "Authorization: Bearer $MANAGER_TOKEN" \
  -H "Content-Type: application/json" -d '{"role":"worker"}' \
  $API/users/$MANAGER_ID/role

# No token at all                        -> expect 401
curl -s -o /dev/null -w "%{http_code}\n" $API/work-orders
~~~

In the browser as the worker, open http://localhost:5173/manager. Expect the access-denied page, with a link back to `/worker`.
Sign out, then open `/worker`. Expect the sign-in page.

Expired session: edit the token in Session storage to some other text and reload. Expect to be sent to sign in, with no crash.

## 6. Reports and the notification bell

1. As the manager, open a work order and the **Report**. Expect the checklist, the status and the open items. Print it
   (Ctrl+P) and check the layout.
2. The bell in the top bar lists real items: overdue work orders, work waiting for review, work with no worker.
   Create a work order that is already overdue and check it appears.

## 7. Record the result

Copy this table into your notes and fill it in.

| Area | Result (Works today / Waiting on the backend / Bug) | Notes |
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

Done when every row is "Works today" or "Waiting on the backend", with no "Bug".
