# Security and privacy

What Proofline AI does to protect people and evidence, and what it does not do yet.

## Accounts and access
- Passwords are hashed with Argon2 and must have at least 12 characters.
- Sign-in gives a short-lived token (30 minutes). Google sign-in is optional.
- Two roles: **manager** and **worker**. Every route checks the role. A worker sees only the work assigned to them. Another worker's data answers "not found".
- Login, register and Google sign-in are rate limited (10, 5 and 10 requests per minute per address).

## Evidence
- Uploads accept only JPG, PNG, WebP, MP4 and WebM. The server checks the extension, the declared type and the first bytes of the file, and enforces size limits (25 MB image, 100 MB video).
- A SHA-256 hash is saved at upload. Every later check compares the stored file with that hash. A mismatch marks the file `failed` and the task `FAILED_INSPECTION`.
- Exact duplicates and very similar photos inside one work order are flagged for a person.
- Files are stored outside the web root in a private volume. They are only served through authorised API routes.

## AI
- The AI gives advice. It never approves or rejects. Only a manager saves the decision.
- Text visible inside images is treated as untrusted and never as an instruction.
- A voice transcript is a worker's claim, not proof. Only the text goes to the audit trail. The audio is not kept.
- AI routes are rate limited (20 requests per minute per user) because each call costs money.
- Without `MODEL_API_KEY` the AI routes answer 503. `MODEL_MOCK=true` uses fixed sample answers for demos and tests.

## Audit trail
- Every important action writes an audit event in the same database transaction as the change. There is no route to edit or delete audit events.

## Web security
- Every response carries a request id and basic security headers (`nosniff`, no framing, no referrer). Sign-in responses are not cached.
- Logs contain method, path, status, time and request id. They never contain tokens, passwords, query strings or request bodies.
- CORS is off unless `CORS_ORIGINS` lists allowed sites. The Docker setup uses one origin (`/api` through nginx), so CORS is not needed there.
- Errors from unexpected failures return a short message and the request id, never a stack trace.

## Data retention (rule for the pilot)
- Evidence and audit events are kept while the work order exists, so a decision can always be checked.
- Recommended: delete photos and videos of closed work orders after 90 days, and keep the audit trail and hashes.
- Until an automatic clean-up exists, deletion is a manual task: remove the file from the evidence volume and record the removal with the manager's name.
- Workers are told before the first capture that photos and video are stored and reviewed (consent notice in the app).

## Known limits
- The sign-in token is kept in the browser's session storage. An httpOnly cookie would be safer.
- The rate limiter is in memory, so it works for one API process. Use a shared store (for example Redis) for several processes.
- Files are not scanned for malware and are not encrypted by the application. Use an encrypted disk or volume in production.
- Metadata such as capture time and GPS is not verified yet.
