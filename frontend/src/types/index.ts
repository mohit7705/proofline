/**
 * Types mirror the FastAPI response schemas in backend/app/schemas/*.py.
 * Field names are kept exactly as the API sends them (snake_case) so there is
 * no hidden mapping layer between the backend and the screens.
 */

export type Role = "manager" | "worker";

export interface User {
  id?: string;
  name: string;
  email: string;
  role: Role;
}

/** Decision states from the evidence gate (roadmap 7.3), plus "pending" before evidence exists. */
export type Verdict = "verified" | "needs_evidence" | "failed" | "needs_review" | "pending";

/* ---------- Work orders ---------- */

export type WorkOrderStatus =
  "draft" | "open" | "in_progress" | "submitted" | "under_review" | "approved" | "rejected" | "cancelled";

export interface WorkOrder {
  id: string;
  title: string;
  description: string;
  created_by: string;
  assigned_to: string | null;
  status: WorkOrderStatus;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_name?: string | null;
  assigned_to_name?: string | null;
  is_self_created?: boolean;
}

export interface WorkOrderCreateInput {
  title: string;
  description: string;
  assigned_to?: string | null;
  due_at?: string | null;
}

export type WorkOrderUpdateInput = Partial<WorkOrderCreateInput> & { status?: WorkOrderStatus };

/* ---------- Tasks ---------- */

export type TaskStatus = "pending" | "in_progress" | "submitted" | "approved" | "rejected";

export interface Task {
  id: string;
  work_order_id: string;
  title: string;
  instructions: string;
  assigned_to: string | null;
  location_id: string | null;
  status: TaskStatus;
  position: number;
}

export interface TaskCreateInput {
  title: string;
  instructions: string;
  assigned_to?: string | null;
  location_id?: string | null;
  position?: number;
}

export type TaskUpdateInput = Partial<TaskCreateInput> & { status?: TaskStatus };

/* ---------- Requirements (checklist) ---------- */

export type ResponseType = "boolean" | "text" | "number" | "photo" | "video";

export interface Requirement {
  id: string;
  task_id: string;
  title: string;
  instructions: string;
  response_type: ResponseType;
  is_required: boolean;
  position: number;
  minimum_evidence_count: number;
  maximum_evidence_count: number;
  required_viewpoints: string[];
  requires_human_inspection: boolean;
  requires_before_after?: boolean;
}

export interface RequirementCreateInput {
  title: string;
  instructions: string;
  response_type?: ResponseType;
  is_required?: boolean;
  position?: number;
  minimum_evidence_count?: number;
  maximum_evidence_count?: number;
  required_viewpoints?: string[];
  requires_human_inspection?: boolean;
  requires_before_after?: boolean;
}

/* ---------- Locations ---------- */

export interface Location {
  id: string;
  site: string;
  building: string | null;
  floor: string | null;
  room: string | null;
  equipment: string | null;
}

export interface LocationCreateInput {
  site: string;
  building?: string | null;
  floor?: string | null;
  room?: string | null;
  equipment?: string | null;
}

/* ---------- Evidence ---------- */

export type IntegrityStatus = "pending" | "passed" | "flagged" | "failed";

/** Technical facts about a video, read by FFprobe on the server when the file is uploaded. */
export interface MediaMetadata {
  format_name?: string | null;
  duration_seconds?: number | null;
  streams?: {
    codec_type?: string | null;
    codec_name?: string | null;
    width?: number | null;
    height?: number | null;
  }[];
}

export interface Evidence {
  id: string;
  task_id: string;
  requirement_id: string | null;
  submitted_by: string;
  media_type: "image" | "video" | string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  sha256_hash: string | null;
  media_metadata?: MediaMetadata | null;
  captured_at: string | null;
  uploaded_at: string;
  integrity_status: IntegrityStatus | string;
  phase?: "before" | "after" | "other";
}

/* ---------- Review, audit, verification (backend endpoints still to be built) ---------- */

export type ReviewOutcome = "approved" | "rejected" | "needs_more_evidence" | "escalate";

export interface ReviewDecision {
  id: string;
  task_id: string;
  reviewer_id: string;
  decision: ReviewOutcome;
  reason: string;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

/** One item from GET /notifications (what needs this user's attention). */
export interface AppNotification {
  id: string;
  kind: "review_needed" | "evidence_issue" | "sent_back" | "task_assigned" | string;
  title: string;
  detail: string;
  task_id: string;
  work_order_id: string;
  created_at: string | null;
}

export type VerificationDecision =
  "VERIFIED" | "NEEDS_MORE_EVIDENCE" | "FAILED_INSPECTION" | "NEEDS_HUMAN_REVIEW";

export interface RequirementResult {
  requirement_id: string;
  decision: VerificationDecision;
  explanation: string;
  evidence_ids: string[];
  /** Seconds into a video that back the observation. */
  timestamps_seconds: number[];
}

export interface IntegritySignal {
  label: string;
  detail: string;
  severity: "info" | "warning" | "critical";
  evidence_id?: string | null;
}

export interface Verification {
  task_id: string;
  decision: VerificationDecision;
  summary: string;
  requirement_results: RequirementResult[];
  integrity_signals: IntegritySignal[];
  follow_up?: { instruction: string; attempts_left: number } | null;
  created_at: string;
}

/* ---------- View models built from real responses ---------- */

export interface WorkerTask {
  order: WorkOrder;
  task: Task;
  requirements: Requirement[];
}

/* ---------- AI analysis, duplicates, segmentation, voice notes ---------- */

export type AnalysisStatus = "pending" | "processing" | "completed" | "failed";
export type Relevance = "relevant" | "potentially_relevant" | "not_relevant" | "uncertain";

export interface VideoObservation {
  observation_id: string;
  timestamp_seconds: number;
  observation: string;
  relevance: Relevance;
  supporting_frame_ids: string[];
  limitations: string[];
}

/** What the model saved on a run. It is `{}` until the run has finished, so every field is optional. */
export interface AnalysisFindings {
  status?: "completed" | "failed";
  observations?: VideoObservation[];
  confidence?: number | null;
  flags?: string[];
  coverage?: {
    video_duration_seconds: number;
    sampled_timestamps_seconds: number[];
    sampling_strategy: string;
  } | null;
  error_code?: string | null;
}

export interface DuplicateMatch {
  evidence_id: string;
  task_id: string;
  filename: string;
  uploaded_at: string;
  match_type: "exact_sha256" | "perceptual_hash";
  /** Only for "perceptual_hash": how many of 64 bits differ. Smaller means more alike. */
  distance: number | null;
}

export interface AnalysisRun {
  id: string;
  evidence_id: string;
  model_name: string;
  model_version: string;
  status: AnalysisStatus;
  findings: AnalysisFindings;
  confidence: number | null;
  duplicate_matches: DuplicateMatch[];
  started_at: string | null;
  completed_at: string | null;
}

/** A region in pixels. x2 and y2 are inclusive; w and h are the full image size. */
export interface SegmentBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  h: number;
}

export interface SegmentResult {
  evidence_id: string;
  integrity_status: string;
  model: string;
  prompt: string;
  boxes: SegmentBox[];
  mask_count: number;
  interpretation: string;
}

export interface Transcript {
  task_id: string;
  transcript: string;
  model?: string;
}

/* ---------- Dashboard summary ---------- */

/** GET /dashboard/summary. Workers get the same shape for their own work. */
export interface DashboardSummary {
  work_orders: Record<string, number>;
  work_orders_total: number;
  tasks: Record<string, number>;
  tasks_total: number;
  /** Tasks in "submitted" (not orders). */
  awaiting_review: number;
  /** Submitted tasks whose latest automated result is "needs human review". */
  needs_human_review: number;
  evidence_issues: { flagged: number; failed: number };
  overdue_work_orders: number;
}

/* ---------- AI score (v2) ---------- */

export type ScoreBand = "strong" | "check" | "weak" | "not_scored";

export interface ScorePart {
  key: string;
  label: string;
  score: number | null;
  detail: string;
}

export interface ItemScore {
  requirement_id: string | null;
  score: number | null;
  band: ScoreBand;
  parts: ScorePart[];
  reasons: string[];
  retake?: string | null;
}

export interface ScoreSet {
  task_id: string;
  scored: boolean;
  stale?: boolean;
  created_at: string | null;
  model_name: string | null;
  model_version: string | null;
  task: ItemScore | null;
  items: ItemScore[];
}

export interface ScoreJob {
  id: string | null;
  task_id: string;
  status: "none" | "queued" | "processing" | "completed" | "failed";
  error_code: string | null;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface ScoreAnalysis {
  task_id: string;
  available: boolean;
  mock: boolean;
  items: Record<string, unknown>[];
  retake_notes: string[];
}

export interface Challenge {
  task_id: string;
  code: string;
  issued_at: string;
}
