# Proofline AI — Database Schema

## 1. Design principles

- PostgreSQL is the source of truth for application records.
- Use UUID primary keys for business entities.
- Store timestamps in UTC using timezone-aware columns.
- Store media in file/object storage; PostgreSQL stores metadata and references.
- Preserve verification history and audit events instead of silently overwriting decisions.
- AI results support human decisions; they do not automatically prove a job was completed.

## 2. Core entities

### users
- id: UUID primary key
- email: unique, required
- password_hash: required; never store plaintext passwords
- full_name: required
- role: manager or worker
- is_active: boolean, default true
- created_at, updated_at: timestamps

### work_orders
- id: UUID primary key
- title, description: required job details
- created_by: foreign key to users
- assigned_to: nullable foreign key to users
- status: draft, open, in_progress, submitted, under_review, approved, rejected, cancelled
- due_at: nullable timestamp
- created_at, updated_at: timestamps

### tasks
- id: UUID primary key
- work_order_id: foreign key to work_orders
- title, instructions: required task details
- status: pending, in_progress, submitted, approved, rejected
- position: task ordering
- created_at, updated_at: timestamps

### evidence
- id: UUID primary key
- task_id: foreign key to tasks
- submitted_by: foreign key to users
- media_type: image or video
- storage_key: private storage reference, not a public URL
- original_filename, content_type, size_bytes
- sha256_hash: nullable until integrity processing completes
- captured_at: nullable claimed capture time
- uploaded_at: server-recorded upload time
- integrity_status: pending, passed, flagged, failed
- created_at: timestamp

### verification_runs
- id: UUID primary key
- evidence_id: foreign key to evidence
- model_name, model_version
- status: pending, processing, completed, failed
- findings: structured JSON result
- confidence: nullable numeric value constrained to 0–1
- started_at, completed_at: nullable timestamps
- created_at: timestamp

### review_decisions
- id: UUID primary key
- task_id: foreign key to tasks
- reviewer_id: foreign key to users
- decision: approved, rejected, or needs_more_evidence
- reason: required explanation
- created_at: timestamp

### audit_events
- id: UUID primary key
- actor_id: nullable foreign key to users
- entity_type, entity_id, action
- details: structured JSON, excluding secrets
- created_at: timestamp

## 3. Relationships

- One manager can create many work orders.
- A work order can have many tasks and one assigned worker.
- A task can have multiple evidence submissions.
- Evidence can have multiple verification runs.
- A task can have multiple review decisions over time.
- Audit events record important actions across the workflow.

## 4. Constraints and indexes

- Unique index on users.email.
- Index work_orders on (created_by, status), (assigned_to, status), and due_at.
- Index tasks on (work_order_id, status).
- Index evidence on (task_id, uploaded_at) and sha256_hash.
- Index verification_runs on (evidence_id, created_at).
- Index review_decisions on (task_id, created_at).
- Index audit_events on (entity_type, entity_id, created_at).
- Enforce valid roles, statuses, nonnegative file sizes, and confidence in [0, 1].
- Use foreign keys and deliberate deletion rules; preserve audit and review history.

## 5. Security and integrity

- Enforce authorization in the API, not only in the UI.
- Workers may submit evidence only for tasks they are authorized to access.
- Only authorized reviewers may record review decisions.
- Treat captured_at as untrusted client-provided metadata.
- Calculate file hashes on the server after upload.
- Keep credentials, secrets, and private storage URLs out of logs.
- Record important status changes and verification decisions in audit_events.

## 6. Implementation order

1. Validate this schema against the required workflow.
2. Configure database settings and SQLAlchemy models.
3. Add Alembic migrations.
4. Add repository/service tests using an isolated test database.
5. Implement authentication and role-based permissions.
